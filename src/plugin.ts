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
 * On receipt the plugin injects a new user turn into the chosen OpenCode session
 * (the extension may target any session by id; otherwise the most recently
 * active one) so the agent responds.
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
  ancestors?: string[];
  landmark?: string;
  componentPath?: string;
  framework?: string;
  html?: string;
}

interface Annotation {
  instruction?: string;
  page?: { url?: string; title?: string };
  element?: ElementMeta;
}

interface SubmitPayload {
  annotations?: Annotation[];
  sessionID?: string;
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
  if (el.componentPath) lines.push(`  ${el.framework ?? "component"} components: ${el.componentPath}`);
  if (el.landmark) lines.push(`  nearest region: ${el.landmark}`);
  if (el.ancestors && el.ancestors.length) lines.push(`  ancestors (nearest first): ${el.ancestors.join(" < ")}`);
  if (el.selector) lines.push(`  css path: ${el.selector}`);
  const context: string[] = [];
  if (el.inShadow) context.push("inside a shadow DOM");
  if (el.inIframe) context.push(`inside an iframe${el.framePath ? ` (${el.framePath})` : ""}`);
  if (context.length) lines.push(`  context: ${context.join(", ")}`);
  if (el.bounds) {
    const b = el.bounds;
    lines.push(`  viewport bounds: ${Math.round(b.width)}×${Math.round(b.height)} at (${Math.round(b.x)}, ${Math.round(b.y)})`);
  }
  if (el.html) lines.push(`  opening tag: ${truncate(el.html.trim(), 500)}`);
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
  // The static interpretation rules live in the `browser-annotation` skill, not
  // in every payload. The header marks this as a browser annotation and tells
  // the agent to use that skill, so the rules are stated once (in the skill),
  // never repeated per message.
  const header =
    annotations.length > 1
      ? `Browser annotations (${annotations.length}) — handle using the \`browser-annotation\` skill. Address each one.`
      : "Browser annotation — handle using the `browser-annotation` skill.";

  const blocks = annotations.map((a, i) => annotationBlock(a, i, annotations.length));

  return [header, "", ...blocks].join("\n");
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

interface SessionInfo {
  id: string;
  title: string;
  updated: number;
}

export const BrowserAnnotationPlugin: Plugin = async ({ client }: PluginInput) => {
  const host = envHost();
  const port = envPort();

  let activeSessionID: string | null = null;
  let server: Server | null = null;

  // Sessions this run has touched (created / messaged / status / idle). Used
  // only to bias the picker ordering — NOT to filter — so sessions from other
  // OpenCode processes and other project directories still appear.
  const activeIDs = new Set<string>();
  // The picker shows every recent session across all directories/processes so
  // one server (whichever wins the port) can target any of them; the shared
  // OpenCode store makes them all reachable over the single loopback port.
  const RECENT_MAX = 25;

  const log = (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
    void client.app
      .log({ body: { service: "browser-annotation", level, message, extra } })
      .catch(() => {});
  };

  async function allSessions(): Promise<SessionInfo[]> {
    try {
      // No directory filter: list every session in the shared OpenCode store so
      // the picker spans all projects and all running processes, not just this
      // plugin instance's own directory.
      const res = (await client.session.list({})) as unknown;
      const rows: any[] = Array.isArray(res) ? res : Array.isArray((res as any)?.data) ? (res as any).data : [];
      return rows
        .filter((s) => s && typeof s.id === "string" && !s.parentID)
        .map((s) => ({ id: s.id, title: typeof s.title === "string" ? s.title : s.id, updated: s.time?.updated ?? 0 }));
    } catch (error) {
      log("warn", `session.list failed: ${error instanceof Error ? error.message : "unknown"}`);
      return [];
    }
  }

  /**
   * The picker list: all sessions, newest first. Sessions this run has actively
   * touched sort ahead of the rest (recency within each group), so "what you're
   * working on" floats to the top without hiding sessions owned by other
   * OpenCode processes or directories.
   */
  async function listSessions(): Promise<SessionInfo[]> {
    const all = await allSessions();
    // Prune tracked ids that no longer exist.
    const existing = new Set(all.map((s) => s.id));
    for (const id of activeIDs) if (!existing.has(id)) activeIDs.delete(id);

    const byRecent = [...all].sort((a, b) => b.updated - a.updated);
    // Stable partition: touched-this-run first, everything else after; each
    // group already in recency order.
    const touched = byRecent.filter((s) => activeIDs.has(s.id));
    const rest = byRecent.filter((s) => !activeIDs.has(s.id));
    return [...touched, ...rest].slice(0, RECENT_MAX);
  }

  async function injectPrompt(sessionID: string, annotations: Annotation[]): Promise<{ ok: boolean; error?: string }> {
    try {
      // No directory scoping: target the session by id wherever it lives.
      await client.session.promptAsync({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text: buildPrompt(annotations) }] },
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "session.prompt failed" };
    }
  }

  async function handleSubmit(
    annotations: Annotation[],
    requestedSessionID?: string,
  ): Promise<{ ok: boolean; error?: string; injected: number; sessionID?: string }> {
    // Prefer the explicitly targeted session; fall back to the last active one.
    let targetID = requestedSessionID || activeSessionID;
    if (requestedSessionID) {
      const sessions = await listSessions();
      if (!sessions.some((s) => s.id === requestedSessionID)) {
        return { ok: false, error: "Target session no longer exists.", injected: 0 };
      }
    }
    if (!targetID) {
      return {
        ok: false,
        error: "No target session. Send a message in OpenCode first, or pick a session.",
        injected: 0,
      };
    }
    const result = await injectPrompt(targetID, annotations);
    if (!result.ok) return { ok: false, error: result.error, injected: 0, sessionID: targetID };
    return { ok: true, injected: annotations.length, sessionID: targetID };
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === "GET" && req.url === "/status") {
      void listSessions().then((sessions) => {
        const active = sessions.find((s) => s.id === activeSessionID);
        sendJson(res, 200, {
          ok: true,
          activeSession: Boolean(activeSessionID),
          sessionID: activeSessionID,
          sessionTitle: active?.title ?? null,
          sessions,
          host,
          port,
        });
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
          const result = await handleSubmit(annotations, payload.sessionID);
          if (result.ok) {
            log("info", `Injected ${result.injected} annotation(s)`, { sessionID: result.sessionID });
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
      if (input?.sessionID) {
        activeSessionID = input.sessionID;
        activeIDs.add(input.sessionID);
      }
    },
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const id = event.properties.info.id;
        if (id) activeIDs.add(id);
      } else if (event.type === "session.updated") {
        const id = event.properties.info.id;
        if (id) activeIDs.add(id);
      } else if (event.type === "session.status") {
        const id = event.properties.sessionID;
        if (id) activeIDs.add(id);
      } else if (event.type === "session.idle") {
        const id = event.properties.sessionID;
        if (id) activeIDs.add(id);
      } else if (event.type === "session.deleted") {
        const id = event.properties.info.id;
        activeIDs.delete(id);
        if (id === activeSessionID) activeSessionID = null;
      }
    },
  };
};

export default BrowserAnnotationPlugin;
