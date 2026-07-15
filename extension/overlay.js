// Overlay content script: a full-window annotation layer plus a right sidebar,
// all rendered inside a shadow root so the host page's CSS cannot interfere and
// ours cannot leak. Toggled via Alt+A (handled by the background worker).
//
// Flow: pick an element (hover highlight + click, shadow-DOM aware via
// composedPath) -> type an instruction in a card -> choose Act/Queue ->
// Submit sends all cards to the background worker, which POSTs to the plugin.

(() => {
  if (window.__ocAnnotationInjected) {
    // Re-injection: just toggle.
    window.dispatchEvent(new CustomEvent("oc-annotation-toggle"));
    return;
  }
  window.__ocAnnotationInjected = true;

  const STYLE = `
    :host { all: initial; }
    #oc-layer {
      position: fixed; inset: 0; pointer-events: none;
      cursor: crosshair; background: transparent;
    }
    #oc-highlight {
      position: fixed; display: none; pointer-events: none;
      border: 2px solid #2b7cff; background: rgba(43,124,255,0.12);
      border-radius: 3px; box-shadow: 0 0 0 1px rgba(255,255,255,0.6);
      transition: all .04s ease-out;
    }
    #oc-hint {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      display: none; gap: 10px; align-items: center; pointer-events: none;
      font: 13px system-ui, sans-serif; color: #fff;
      background: rgba(20,22,28,.92); padding: 8px 14px; border-radius: 999px;
      box-shadow: 0 6px 20px rgba(0,0,0,.25);
    }
    #oc-hint .key {
      font-size: 11px; background: rgba(255,255,255,.18);
      padding: 2px 7px; border-radius: 5px;
    }
    #oc-sidebar {
      position: fixed; top: 0; right: 0; height: 100vh; width: 344px;
      pointer-events: auto; display: flex; flex-direction: column;
      background: #fbfbfd; color: #1c1d21;
      font: 14px/1.45 system-ui, -apple-system, sans-serif;
      box-shadow: -8px 0 30px rgba(0,0,0,.16);
      border-left: 1px solid rgba(0,0,0,.08);
    }
    #oc-sidebar header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,.07);
    }
    #oc-sidebar header .title { font-weight: 650; font-size: 14px; letter-spacing: .2px; }
    #oc-close {
      border: none; background: transparent; font-size: 16px; color: #8a8d96;
      cursor: pointer; border-radius: 6px; width: 28px; height: 28px;
    }
    #oc-close:hover { background: rgba(0,0,0,.06); color: #1c1d21; }
    .oc-actions { padding: 12px 16px 4px; }
    button.primary {
      font: inherit; font-weight: 600; width: 100%;
      padding: 9px 12px; border-radius: 9px; cursor: pointer;
      color: #fff; background: #2b7cff; border: 1px solid #2b7cff;
      transition: background .15s, transform .05s;
    }
    button.primary:hover:not(:disabled) { background: #1e6ef0; }
    button.primary:active:not(:disabled) { transform: translateY(1px); }
    button.primary:disabled { opacity: .45; cursor: default; }
    #oc-pick.active { background: #e8551f; border-color: #e8551f; }
    #oc-list { flex: 1; overflow-y: auto; padding: 10px 16px; display: flex; flex-direction: column; gap: 10px; }
    .oc-empty { color: #8a8d96; font-size: 13px; padding: 20px 4px; text-align: center; }
    .oc-card {
      background: #fff; border: 1px solid rgba(0,0,0,.08); border-radius: 12px;
      padding: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.05);
    }
    .oc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
    .oc-desc {
      font: 12px ui-monospace, monospace; color: #4a4d57;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      background: #f0f1f4; padding: 2px 7px; border-radius: 6px;
    }
    .oc-rm { color: #b02a2a; cursor: pointer; font-size: 13px; padding: 0 2px; }
    .oc-rm:hover { color: #e03131; }
    .oc-card textarea {
      width: 100%; box-sizing: border-box; resize: vertical; font: inherit;
      border: 1px solid rgba(0,0,0,.12); border-radius: 8px; padding: 7px 9px;
      background: #fff; color: #1c1d21;
    }
    .oc-card textarea:focus { outline: none; border-color: #2b7cff; box-shadow: 0 0 0 3px rgba(43,124,255,.15); }
    .oc-modes { display: flex; gap: 6px; margin-top: 8px; }
    .oc-mode {
      font: inherit; font-size: 12px; font-weight: 600; flex: 1;
      padding: 5px 8px; border-radius: 7px; cursor: pointer;
      background: #f0f1f4; color: #55585f; border: 1px solid transparent;
    }
    .oc-mode:hover { background: #e7e8ec; }
    .oc-mode.sel { background: #e8f0ff; color: #1e6ef0; border-color: #bcd4ff; }
    #oc-sidebar footer { padding: 12px 16px 14px; border-top: 1px solid rgba(0,0,0,.07); position: relative; }
    .oc-status { font-size: 12px; margin-bottom: 9px; display: flex; align-items: center; gap: 7px; }
    .oc-status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #b7bac2; flex: none; }
    .oc-status.good::before { background: #1faa5a; }
    .oc-status.warn::before { background: #e0a020; }
    .oc-status.bad::before { background: #e03131; }
    .oc-status.checking::before { background: #7aa7ff; }
    .oc-status.good { color: #178048; }
    .oc-status.warn { color: #9a6a10; }
    .oc-status.bad { color: #b02a2a; }
    .oc-toast {
      position: absolute; left: 16px; right: 16px; bottom: 60px;
      background: #1c1d21; color: #fff; font-size: 12.5px;
      padding: 8px 12px; border-radius: 9px; opacity: 0; transform: translateY(6px);
      transition: opacity .2s, transform .2s; pointer-events: none;
      box-shadow: 0 8px 24px rgba(0,0,0,.22);
    }
    .oc-toast.show { opacity: 1; transform: translateY(0); }
    .oc-toast.bad { background: #b02a2a; }
  `;

  let host = null; // shadow host element
  let root = null; // shadow root
  let picking = false;
  let hoverEl = null;
  let annotations = []; // { instruction, mode, page, element }
  let statusTimer = null;

  // ---------- element metadata ----------

  function bestTestId(el) {
    for (const attr of ["data-testid", "data-test", "data-test-id", "data-cy", "data-qa"]) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v) return v;
    }
    return undefined;
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let sel = node.nodeName.toLowerCase();
      if (node.classList && node.classList.length) {
        sel += "." + Array.from(node.classList).slice(0, 3).map((c) => CSS.escape(c)).join(".");
      }
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.nodeName === node.nodeName);
        if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
      parts.unshift(sel);
      if (node.id) {
        parts[0] = `#${CSS.escape(node.id)}`;
        break;
      }
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function elementMeta(el, inShadow) {
    const r = el.getBoundingClientRect();
    const classes = el.classList ? Array.from(el.classList) : [];
    const meta = {
      selector: cssPath(el),
      tag: el.tagName,
      id: el.id || undefined,
      name: el.getAttribute("name") || undefined,
      testId: bestTestId(el),
      role: el.getAttribute("role") || undefined,
      ariaLabel: el.getAttribute("aria-label") || undefined,
      classes: classes.length ? classes : undefined,
      text: (el.textContent || "").trim().slice(0, 500) || undefined,
      href: el.getAttribute("href") || undefined,
      src: el.getAttribute("src") || undefined,
      bounds: { x: r.left, y: r.top, width: r.width, height: r.height },
      inShadow: Boolean(inShadow),
      inIframe: window.top !== window.self,
      html: (el.outerHTML || "").slice(0, 800),
    };
    for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
    return meta;
  }

  function shortDescriptor(el) {
    const tag = (el.tag || "el").toLowerCase();
    const id = el.testId ? `[data-testid=${el.testId}]` : el.id ? `#${el.id}` : el.ariaLabel ? `[${el.ariaLabel}]` : "";
    return `<${tag}>${id}`;
  }

  // ---------- picking ----------

  function pickTarget(e) {
    // composedPath surfaces the real element inside shadow roots; e.target only
    // gives the shadow host.
    const path = e.composedPath ? e.composedPath() : [];
    for (const n of path) {
      if (n instanceof Element && n !== host && !(root && root.contains(n))) {
        const inShadow = n.getRootNode && n.getRootNode() instanceof ShadowRoot;
        return { el: n, inShadow };
      }
    }
    const t = e.target;
    return t instanceof Element ? { el: t, inShadow: false } : null;
  }

  function positionHighlight(el) {
    const box = root.getElementById("oc-highlight");
    if (!box) return;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      display: "block",
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }

  function onMove(e) {
    if (!picking) return;
    const hit = pickTarget(e);
    if (!hit) return;
    hoverEl = hit.el;
    hoverEl.__ocInShadow = hit.inShadow;
    positionHighlight(hoverEl);
  }

  function onClick(e) {
    if (!picking) return;
    const hit = pickTarget(e);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    stopPicking();
    addCardForElement(elementMeta(hit.el, hit.inShadow));
  }

  function onKey(e) {
    if (e.key === "Escape") {
      if (picking) {
        stopPicking();
      } else {
        close();
      }
    }
  }

  function startPicking() {
    picking = true;
    root.getElementById("oc-layer").style.pointerEvents = "auto";
    root.getElementById("oc-hint").style.display = "flex";
    setPickBtn(true);
  }

  function stopPicking() {
    picking = false;
    const box = root.getElementById("oc-highlight");
    if (box) box.style.display = "none";
    root.getElementById("oc-layer").style.pointerEvents = "none";
    root.getElementById("oc-hint").style.display = "none";
    setPickBtn(false);
  }

  function setPickBtn(active) {
    const btn = root.getElementById("oc-pick");
    if (btn) {
      btn.textContent = active ? "Picking… (Esc to cancel)" : "Select element";
      btn.classList.toggle("active", active);
    }
  }

  // ---------- annotation cards ----------

  function addCardForElement(element) {
    annotations.push({ instruction: "", mode: "act", page: { url: location.href, title: document.title }, element });
    renderCards();
    // focus the new card's textarea
    const areas = root.querySelectorAll(".oc-card textarea");
    const last = areas[areas.length - 1];
    if (last) last.focus();
  }

  function renderCards() {
    const list = root.getElementById("oc-list");
    list.innerHTML = "";
    if (annotations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "oc-empty";
      empty.textContent = "No annotations yet. Click “Select element”, then pick something on the page.";
      list.appendChild(empty);
    }
    annotations.forEach((a, i) => {
      const card = document.createElement("div");
      card.className = "oc-card";
      card.innerHTML = `
        <div class="oc-card-head">
          <span class="oc-desc" title="${escapeHtml(a.element.selector || "")}">${escapeHtml(shortDescriptor(a.element))}</span>
          <span class="oc-rm" data-i="${i}" title="Remove">✕</span>
        </div>
        <textarea rows="2" placeholder="Instruction for this element…" data-i="${i}">${escapeHtml(a.instruction)}</textarea>
        <div class="oc-modes" data-i="${i}">
          <button class="oc-mode ${a.mode === "act" ? "sel" : ""}" data-mode="act" data-i="${i}">Act now</button>
          <button class="oc-mode ${a.mode === "queue" ? "sel" : ""}" data-mode="queue" data-i="${i}">Queue</button>
        </div>`;
      list.appendChild(card);
    });
    updateSubmit();
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function updateSubmit() {
    const btn = root.getElementById("oc-submit");
    btn.disabled = annotations.length === 0;
    btn.textContent = annotations.length ? `Submit ${annotations.length} to agent` : "Submit to agent";
  }

  // ---------- status ----------

  async function refreshStatus() {
    const el = root.getElementById("oc-status");
    el.className = "oc-status checking";
    el.textContent = "Checking connection…";
    chrome.runtime.sendMessage({ type: "oc-status" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        el.className = "oc-status bad";
        el.textContent = "Extension error";
        return;
      }
      if (res.ok && res.data?.ok) {
        if (res.data.activeSession) {
          const name = res.data.sessionTitle || res.data.sessionID || "active session";
          const q = res.data.queued ? ` · ${res.data.queued} queued` : "";
          el.className = "oc-status good";
          el.textContent = `Connected — ${name}${q}`;
        } else {
          el.className = "oc-status warn";
          el.textContent = "Connected — send a message in OpenCode first";
        }
      } else {
        el.className = "oc-status bad";
        el.textContent = "Not connected — check the SSH tunnel";
      }
    });
  }

  // ---------- submit ----------

  function collectInstructions() {
    root.querySelectorAll(".oc-card textarea").forEach((ta) => {
      const i = Number(ta.dataset.i);
      if (annotations[i]) annotations[i].instruction = ta.value.trim();
    });
  }

  function submit() {
    collectInstructions();
    if (annotations.length === 0) return;
    const btn = root.getElementById("oc-submit");
    btn.disabled = true;
    setToast("Submitting…");
    chrome.runtime.sendMessage({ type: "oc-submit", annotations }, (res) => {
      if (chrome.runtime.lastError || !res) {
        setToast("Extension error", true);
        updateSubmit();
        return;
      }
      if (res.ok) {
        const parts = [];
        if (res.injected) parts.push(`${res.injected} sent`);
        if (res.queued) parts.push(`${res.queued} queued`);
        setToast(parts.length ? parts.join(", ") : "Submitted");
        annotations = [];
        renderCards();
        refreshStatus();
      } else {
        setToast(`Failed: ${res.error || "unknown"}`, true);
        updateSubmit();
      }
    });
  }

  function setToast(text, bad) {
    const t = root.getElementById("oc-toast");
    t.textContent = text;
    t.className = "oc-toast show" + (bad ? " bad" : "");
    clearTimeout(t.__timer);
    t.__timer = setTimeout(() => (t.className = "oc-toast"), 4000);
  }

  // ---------- UI construction ----------

  function buildUI() {
    host = document.createElement("div");
    host.id = "oc-annotation-host";
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <div id="oc-layer"></div>
      <div id="oc-highlight"></div>
      <div id="oc-hint"><span>Hover an element and click to annotate</span><span class="key">Esc</span></div>
      <aside id="oc-sidebar">
        <header>
          <div class="title">OpenCode Annotation</div>
          <button id="oc-close" title="Close (Esc)">✕</button>
        </header>
        <div class="oc-actions"><button id="oc-pick" class="primary">Select element</button></div>
        <div id="oc-list"></div>
        <footer>
          <div id="oc-status" class="oc-status">…</div>
          <button id="oc-submit" class="primary" disabled>Submit to agent</button>
          <div id="oc-toast" class="oc-toast"></div>
        </footer>
      </aside>`;
    document.documentElement.appendChild(host);

    root.getElementById("oc-pick").addEventListener("click", () => (picking ? stopPicking() : startPicking()));
    root.getElementById("oc-close").addEventListener("click", close);
    root.getElementById("oc-submit").addEventListener("click", submit);

    // event delegation for card controls
    root.getElementById("oc-list").addEventListener("click", (e) => {
      const rm = e.target.closest(".oc-rm");
      if (rm) {
        annotations.splice(Number(rm.dataset.i), 1);
        renderCards();
        return;
      }
      const mode = e.target.closest(".oc-mode");
      if (mode) {
        annotations[Number(mode.dataset.i)].mode = mode.dataset.mode;
        renderCards();
      }
    });

    renderCards();
    refreshStatus();
    statusTimer = setInterval(refreshStatus, 15000);
  }

  // ---------- lifecycle ----------

  function open() {
    if (host) {
      host.style.display = "block";
    } else {
      buildUI();
    }
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function close() {
    stopPicking();
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    if (host) host.style.display = "none";
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  }

  let visible = false;
  function toggle() {
    visible = !visible;
    if (visible) {
      open();
      if (statusTimer === null && host) statusTimer = setInterval(refreshStatus, 15000);
    } else {
      close();
    }
  }

  window.addEventListener("oc-annotation-toggle", toggle);
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "oc-toggle") toggle();
  });

  // First injection opens immediately.
  visible = true;
  open();
})();
