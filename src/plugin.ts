import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Plugin, PluginInput } from "@opencode-ai/plugin";

/**
 * opencode-browser-annotation-plugin
 *
 * Runs a loopback HTTP server on the OpenCode host. A browser extension POSTs
 * annotations (a typed instruction plus selected-element metadata) to it. When
 * the browser runs on a separate desktop, the extension reaches this server over
 * an `ssh -L` local forward (desktop -> host).
 *
 * On receipt the plugin injects a new user turn into the most recently active
 * OpenCode session so the agent responds. Annotations may be acted on
 * immediately ("act") or queued and flushed with a later act ("queue").
 *
 * Scope: text + element metadata only. No screenshots, no image/vision.
 */

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 39_517;

interface ElementMeta {
  selector?: string;
  tag?: string;
  id?: string;
  name?: string;
  testId?: string;
  role?: string;
  ariaLabel?: string;
  classes?: string[];
  text?: string;
  href?: string;
  src?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  inShadow?: boolean;
  inIframe?: boolean;
  framePath?: string;
  html?: string;
}

type AnnotationMode = "act" | "queue";

interface Annotation {
  instruction?: string;
  mode?: AnnotationMode;
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

/**
 * Surface the most code-locatable identifiers first: test ids and framework
 * hooks are what map to source, not pixel bounds.
 */
function formatElement(el: ElementMeta | undefined): string {
  if (!el) return "  (no element captured)";
  const lines: string[] = [];
  const tag = el.tag ? el.tag.toLowerCase() : "element";
  lines.push(`  Element: <${tag}>`);
  if (el.testId) lines.push(`  data-testid: ${el.testId}`);
  if (el.id) lines.push(`  id: ${el.id}`);
  if (el.name) lines.push(`  name: ${el.name}`);
  if (el.role) lines.push(`  role: ${el.role}`);
  if (el.ariaLabel) lines.push(`  aria-label: ${el.ariaLabel}`);
  if (el.classes && el.classes.length) lines.push(`  classes: ${el.classes.slice(0, 8).join(" ")}`);
  if (el.href) lines.push(`  href: ${el.href}`);
  if (el.src) lines.push(`  src: ${el.src}`);
  if (el.text) lines.push(`  text: ${JSON.stringify(truncate(el.text.trim(), 200))}`);
  if (el.selector) lines.push(`  css path: ${el.selector}`);
  const context: string[] = [];
  if (el.inShadow) context.push("inside a shadow DOM");
  if (el.inIframe) context.push(`inside an iframe${el.framePath ? ` (${el.framePath})` : ""}`);
  if (context.length) lines.push(`  context: ${context.join(", ")}`);
  if (el.bounds) {
    const b = el.bounds;
    lines.push(`  viewport bounds: ${Math.round(b.width)}×${Math.round(b.height)} at (${Math.round(b.x)}, ${Math.round(b.y)})`);
  }
  if (el.html) lines.push(`  outer html: ${truncate(el.html.trim(), 500)}`);
  return lines.join("\n");
}

function annotationBlock(a: Annotation, index: number, total: number): string {
  const label = total > 1 ? ` ${index + 1}` : "";
  const page = a.page ?? {};
  const instruction = (a.instruction ?? "").trim() || "(no instruction text)";
  return [
    `### Annotation${label}`,
    `Instruction: ${instruction}`,
    page.url ? `Page: ${page.title ? `${page.title} — ` : ""}${page.url}` : "",
    "Selected element:",
    formatElement(a.element),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(annotations: Annotation[]): string {
  const header =
    annotations.length > 1
      ? `The user made ${annotations.length} annotations in the browser. Address each one.`
      : "The user made an annotation in the browser.";

  const blocks = annotations.map((a, i) => annotationBlock(a, i, annotations.length));

  return [
    header,
    "",
    ...blocks,
    "",
    "Guidance:",
    "- Locate the code for each element using the most stable identifier available (data-testid, id, name, role, then unique class or text). Treat the CSS path and viewport bounds as weak hints only.",
    "- Confirm the element actually exists in this codebase before editing; if you cannot find it, say so instead of guessing.",
    "- No screenshot is attached; reason from the metadata and the code.",
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
  let activeSessionTitle: string | null = null;
  let server: Server | null = null;
  const queued: Annotation[] = [];

  const log = (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
    void client.app
      .log({ body: { service: "browser-annotation", level, message, extra } })
      .catch(() => {});
  };

  async function injectPrompt(annotations: Annotation[]): Promise<{ ok: boolean; error?: string }> {
    try {
      await client.session.promptAsync({
        path: { id: activeSessionID as string },
        query: { directory },
        body: { parts: [{ type: "text", text: buildPrompt(annotations) }] },
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "session.prompt failed" };
    }
  }

  /**
   * Queue annotations are held until an "act" annotation arrives (or all-queue
   * submits nothing yet). An act annotation flushes the queue plus itself.
   */
  async function handleSubmit(
    annotations: Annotation[],
  ): Promise<{ ok: boolean; error?: string; injected: number; queued: number; sessionID?: string }> {
    if (!activeSessionID) {
      return {
        ok: false,
        error: "No active OpenCode session yet. Send a message in OpenCode first.",
        injected: 0,
        queued: queued.length,
      };
    }

    const toQueue = annotations.filter((a) => a.mode === "queue");
    const toAct = annotations.filter((a) => a.mode !== "queue");
    queued.push(...toQueue);

    if (toAct.length === 0) {
      return { ok: true, injected: 0, queued: queued.length, sessionID: activeSessionID };
    }

    const batch = [...queued, ...toAct];
    queued.length = 0;
    const result = await injectPrompt(batch);
    if (!result.ok) {
      // Re-queue so nothing is lost.
      queued.unshift(...batch.filter((a) => a.mode === "queue"));
      return { ok: false, error: result.error, injected: 0, queued: queued.length, sessionID: activeSessionID };
    }
    return { ok: true, injected: batch.length, queued: queued.length, sessionID: activeSessionID };
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === "GET" && req.url === "/status") {
      sendJson(res, 200, {
        ok: true,
        activeSession: Boolean(activeSessionID),
        sessionID: activeSessionID,
        sessionTitle: activeSessionTitle,
        queued: queued.length,
        host,
        port,
      });
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
          const result = await handleSubmit(annotations);
          if (result.ok) {
            log("info", `Annotations: injected ${result.injected}, queued ${result.queued}`, {
              sessionID: result.sessionID,
            });
            sendJson(res, 200, result);
          } else {
            log("warn", `Annotation submit failed: ${result.error}`);
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
      if (event.type === "session.updated") {
        const info = event.properties.info;
        if (info.id === activeSessionID && typeof info.title === "string") {
          activeSessionTitle = info.title;
        }
      } else if (event.type === "session.deleted") {
        if (event.properties.info.id === activeSessionID) {
          activeSessionID = null;
          activeSessionTitle = null;
        }
      }
    },
  };
};

export default BrowserAnnotationPlugin;
