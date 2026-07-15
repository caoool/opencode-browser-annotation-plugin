// Background service worker.
// - Alt+A            -> start element picking
// - Alt+Shift+A      -> toggle the annotation-list sidebar
// - toolbar click    -> toggle the sidebar
// Performs all network I/O to the plugin endpoint (status + submit), because
// page CSP can block a content script from fetching localhost.

const DEFAULT_ENDPOINT = "http://127.0.0.1:39517";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

async function getEndpoint() {
  const { endpoint } = await chrome.storage.local.get("endpoint");
  return (endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

async function ensureInjected(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => Boolean(window.__ocAnnotationInjected),
  });
  if (!result) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
  }
}

async function sendToOverlay(tab, type) {
  if (!tab?.id) return;
  try {
    await ensureInjected(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch {
    // e.g. chrome:// pages or the web store cannot be injected.
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (command === "select-element") await sendToOverlay(tab, "oc-pick");
  else if (command === "toggle-sidebar") await sendToOverlay(tab, "oc-toggle-sidebar");
});

chrome.action.onClicked.addListener((tab) => {
  void sendToOverlay(tab, "oc-toggle-sidebar");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "oc-capture") {
      // Capture the visible tab for the extension's own thumbnail preview only.
      // This image is never sent to the plugin/agent; the content script crops
      // it to the element and keeps it local to the sidebar UI.
      try {
        const windowId = sender?.tab?.windowId;
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
        sendResponse({ ok: true, dataUrl });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "capture failed" });
      }
      return;
    }

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
          body: JSON.stringify({ extensionVersion: EXTENSION_VERSION, annotations, sessionID: msg.sessionID }),
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
