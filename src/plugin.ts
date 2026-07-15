import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Plugin, PluginInput } from "@opencode-ai/plugin";


/**
 * opencode-browser-annotation-plugin
 *
 * Runs a loopback HTTP server on the OpenCode host. A browser extension POSTs
 * annotations (a typed instruction plus selected-element metadata) to it, over
 * an `ssh -R` reverse tunnel when the browser is on a separate desktop. On
 * receipt, the plugin injects a new user turn into the most recently active
 * OpenCode session so the agent responds.
 *
 * Scope: text + element metadata only. No screenshots, no image/vision.
 */

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 39_517;

interface ElementMeta {
  selector?: string;
  tag?: string;
  text?: string;
  role?: string;
  ariaLabel?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  html?: string;
}

interface Annotation {
  instruction?: string;
  page?: { url?: string; title?: string };
  element?: ElementMeta;
}

interface SubmitPayload {
  annotations?: Annotation[];
  extensionVersion?: string;
}

function envHost(): string {
  return process.env.OPENCODE_ANNOTATION_HOST?.trim() || DEFAULT_HOST;
}

function envPort(): number {
  const raw = process.env.OPENCODE_ANNOTATION_PORT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_PORT;
  return Number.isFinite(n) && n > 0 && n < 65_536 ? n : DEFAULT_PORT;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function formatElement(el: ElementMeta | undefined): string {
  if (!el) return "- (no element captured)";
  const lines: string[] = [];
  if (el.tag) lines.push(`- Tag: ${el.tag}`);
  if (el.selector) lines.push(`- Selector: ${el.selector}`);
  if (el.role) lines.push(`- Role: ${el.role}`);
  if (el.ariaLabel) lines.push(`- ARIA label: ${el.ariaLabel}`);
  if (el.text) lines.push(`- Text: ${truncate(el.text.trim(), 300)}`);
  if (el.bounds) {
    const b = el.bounds;
    lines.push(`- Bounds: x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.width)} h=${Math.round(b.height)}`);
  }
  if (el.html) lines.push(`- Outer HTML: ${truncate(el.html.trim(), 600)}`);
  return lines.length ? lines.join("\n") : "- (no element details)";
}

function buildPrompt(annotations: Annotation[]): string {
  const header =
    annotations.length > 1
      ? `The user submitted ${annotations.length} browser annotations. Address each one.`
      : "The user submitted a browser annotation.";

  const blocks = annotations.map((a, i) => {
    const n = annotations.length > 1 ? ` ${i + 1}` : "";
    const page = a.page ?? {};
    const instruction = (a.instruction ?? "").trim() || "(no instruction text)";
    return [
      `## Annotation${n}`,
      `Instruction: ${instruction}`,
      page.url ? `Page: ${page.title ? `${page.title} — ` : ""}${page.url}` : "",
      "Selected element:",
      formatElement(a.element),
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    header,
    "",
    ...blocks,
    "",
    "Use the element metadata to locate the relevant code and make the requested change. No screenshot is attached.",
  ].join("\n");
}

async function readJsonBody(req: IncomingMessage, limitBytes = 2_000_000): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  // Set headers individually and assign statusCode before end(). Combined
  // writeHead(status, headers) is not reliably flushed by the Bun node:http
  // compatibility layer that OpenCode runs under, which yields empty replies.
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // The extension calls from a browser origin; allow it to read the response.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.statusCode = status;
  res.end(payload);
}

export const BrowserAnnotationPlugin: Plugin = async ({ client, directory }: PluginInput) => {
  const host = envHost();
  const port = envPort();

  let activeSessionID: string | null = null;
  let server: Server | null = null;

  const log = (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
    void client.app
      .log({ body: { service: "browser-annotation", level, message, extra } })
      .catch(() => {});
  };

  async function inject(annotations: Annotation[]): Promise<{ ok: boolean; error?: string; sessionID?: string }> {
    if (!activeSessionID) {
      return { ok: false, error: "No active OpenCode session yet. Send a message in OpenCode first." };
    }
    try {
      // promptAsync injects the turn without blocking on the agent's full
      // response, so the extension gets a prompt acknowledgement.
      await client.session.promptAsync({
        path: { id: activeSessionID },
        query: { directory },
        body: { parts: [{ type: "text", text: buildPrompt(annotations) }] },
      });
      return { ok: true, sessionID: activeSessionID };
    } catch (error) {
      const message = error instanceof Error ? error.message : "session.prompt failed";
      return { ok: false, error: message, sessionID: activeSessionID };
    }
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === "GET" && req.url === "/status") {
      sendJson(res, 200, { ok: true, activeSession: Boolean(activeSessionID), host, port });
      return;
    }
    if (req.method === "POST" && req.url === "/annotations") {
      readJsonBody(req)
        .then(async (parsed) => {
          const payload = (parsed ?? {}) as SubmitPayload;
          const annotations = Array.isArray(payload.annotations) ? payload.annotations : [];
          if (annotations.length === 0) {
            sendJson(res, 400, { ok: false, error: "No annotations in payload." });
            return;
          }
          const result = await inject(annotations);
          if (result.ok) {
            log("info", `Injected ${annotations.length} annotation(s)`, { sessionID: result.sessionID });
            sendJson(res, 200, { ok: true, count: annotations.length, sessionID: result.sessionID });
          } else {
            log("warn", `Annotation injection failed: ${result.error}`);
            sendJson(res, 409, result);
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "bad request";
          sendJson(res, 400, { ok: false, error: message });
        });
      return;
    }
    sendJson(res, 404, { ok: false, error: "Not found" });
  }

  function start(): void {
    if (server) return; // never double-listen (the plugin may init more than once)
    const s = createServer(handle);
    server = s; // claim synchronously so a re-entrant start() is a no-op
    s.on("error", (error: NodeJS.ErrnoException) => {
      // Another instance already owns the port. Drop this half-open server so we
      // don't leave a listener that resets connections without responding.
      server = null;
      s.close();
      if (error.code !== "EADDRINUSE") {
        log("error", `Annotation server error: ${error.message}`);
      }
    });
    s.listen(port, host, () => {
      log("info", `Browser annotation server listening on http://${host}:${port}`);
    });
  }

  start();

  return {
    "chat.message": async (input) => {
      if (input?.sessionID) activeSessionID = input.sessionID;
    },
    event: async ({ event }) => {
      if (event.type === "session.deleted") {
        if (event.properties.info.id === activeSessionID) activeSessionID = null;
      }
    },
  };
};

export default BrowserAnnotationPlugin;
