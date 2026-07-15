// Content script: element picker + annotation capture.
// Injected on demand by the popup. Highlights elements on hover, captures a
// selected element's metadata plus a typed instruction, and stores annotations
// via the background service worker.

(() => {
  if (window.__ocAnnotationActive) return;
  window.__ocAnnotationActive = true;

  const HIGHLIGHT_ID = "__oc-annotation-highlight";
  let overlay = null;
  let current = null;

  function makeOverlay() {
    const el = document.createElement("div");
    el.id = HIGHLIGHT_ID;
    Object.assign(el.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483646",
      border: "2px solid #2b7cff",
      background: "rgba(43,124,255,0.12)",
      borderRadius: "2px",
      transition: "all 0.03s ease-out",
      display: "none",
    });
    document.documentElement.appendChild(el);
    return el;
  }

  function positionOverlay(target) {
    if (!overlay) return;
    const r = target.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: "block",
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let selector = node.nodeName.toLowerCase();
      if (node.classList.length) {
        selector += "." + Array.from(node.classList).slice(0, 3).map((c) => CSS.escape(c)).join(".");
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.nodeName === node.nodeName);
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(selector);
      if (node.id) {
        parts[0] = `#${CSS.escape(node.id)}`;
        break;
      }
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function elementMeta(el) {
    const r = el.getBoundingClientRect();
    return {
      selector: cssPath(el),
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 500),
      role: el.getAttribute("role") || undefined,
      ariaLabel: el.getAttribute("aria-label") || undefined,
      bounds: { x: r.left, y: r.top, width: r.width, height: r.height },
      html: el.outerHTML.slice(0, 800),
    };
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    if (overlay) overlay.remove();
    overlay = null;
    window.__ocAnnotationActive = false;
  }

  function onMove(e) {
    const target = e.target;
    if (!target || target === overlay) return;
    current = target;
    positionOverlay(target);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanup();
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = current || e.target;
    if (!target) return;
    const instruction = window.prompt("Instruction for this element:");
    if (instruction === null) return; // cancelled; keep picking
    const annotation = {
      instruction: instruction.trim(),
      page: { url: location.href, title: document.title },
      element: elementMeta(target),
    };
    chrome.runtime.sendMessage({ type: "oc-add-annotation", annotation }, () => {});
    cleanup();
  }

  overlay = makeOverlay();
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
})();
