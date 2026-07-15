// Background service worker.
// - Toggles the annotation overlay on Alt+A (command) or toolbar click.
// - Performs all network I/O to the plugin endpoint (status + submit), because
//   page CSP can block a content script from fetching localhost. Results are
//   returned to the overlay via message responses.

const DEFAULT_ENDPOINT = "http://127.0.0.1:39517";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

async function getEndpoint() {
  const { endpoint } = await chrome.storage.local.get("endpoint");
  return (endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

async function toggleOverlay(tab) {
  if (!tab?.id) return;
  try {
    // The overlay content script listens for this and toggles itself. If it is
    // not injected yet, inject it first, then it opens on load.
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Boolean(window.__ocAnnotationInjected),
    });
    if (!result) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["overlay.js"] });
    } else {
      await chrome.tabs.sendMessage(tab.id, { type: "oc-toggle" });
    }
  } catch {
    // e.g. chrome:// pages or the web store cannot be injected.
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-overlay") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await toggleOverlay(tab);
});

chrome.action.onClicked.addListener((tab) => {
  void toggleOverlay(tab);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "oc-status") {
      try {
        const endpoint = await getEndpoint();
        const res = await fetch(`${endpoint}/status`, { method: "GET" });
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, endpoint, data });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "unreachable" });
      }
      return;
    }

    if (msg?.type === "oc-submit") {
      const annotations = Array.isArray(msg.annotations) ? msg.annotations : [];
      if (annotations.length === 0) {
        sendResponse({ ok: false, error: "No annotations to submit." });
        return;
      }
      try {
        const endpoint = await getEndpoint();
        const res = await fetch(`${endpoint}/annotations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ extensionVersion: EXTENSION_VERSION, annotations }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          sendResponse({ ok: true, injected: data.injected ?? 0, queued: data.queued ?? 0, sessionID: data.sessionID });
        } else {
          sendResponse({ ok: false, error: data.error || `HTTP ${res.status}` });
        }
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "Request failed. Is the tunnel up?" });
      }
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })();
  return true; // async response
});
