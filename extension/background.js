// Background service worker: holds the annotation list and submits the batch to
// the plugin's loopback HTTP server (reached over an ssh -R tunnel when the
// OpenCode host is remote).

const DEFAULT_ENDPOINT = "http://127.0.0.1:39517";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

async function getEndpoint() {
  const { endpoint } = await chrome.storage.local.get("endpoint");
  return (endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

async function getAnnotations() {
  const { annotations } = await chrome.storage.local.get("annotations");
  return Array.isArray(annotations) ? annotations : [];
}

async function setAnnotations(list) {
  await chrome.storage.local.set({ annotations: list });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "oc-add-annotation" && msg.annotation) {
      const list = await getAnnotations();
      list.push({ ...msg.annotation, ts: Date.now() });
      await setAnnotations(list);
      sendResponse({ ok: true, count: list.length });
      return;
    }

    if (msg?.type === "oc-list") {
      sendResponse({ ok: true, annotations: await getAnnotations() });
      return;
    }

    if (msg?.type === "oc-clear") {
      await setAnnotations([]);
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "oc-remove" && typeof msg.index === "number") {
      const list = await getAnnotations();
      list.splice(msg.index, 1);
      await setAnnotations(list);
      sendResponse({ ok: true, annotations: list });
      return;
    }

    if (msg?.type === "oc-submit") {
      const list = await getAnnotations();
      if (list.length === 0) {
        sendResponse({ ok: false, error: "No annotations to submit." });
        return;
      }
      try {
        const endpoint = await getEndpoint();
        const res = await fetch(`${endpoint}/annotations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ extensionVersion: EXTENSION_VERSION, annotations: list }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          await setAnnotations([]);
          sendResponse({ ok: true, count: data.count });
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
