// Overlay content script: a picking layer plus a right sidebar, rendered inside
// a shadow root so the host page's CSS cannot interfere and ours cannot leak.
// Toggled via Alt+A (background command) or the toolbar icon.
//
// Flow: pick an element (hover highlight + click, shadow-DOM aware via
// composedPath) -> type an instruction in a card -> choose Act/Queue ->
// Submit sends all cards to the background worker, which POSTs to the plugin.

(() => {
  if (window.__ocAnnotationInjected) {
    window.dispatchEvent(new CustomEvent("oc-annotation-toggle"));
    return;
  }
  window.__ocAnnotationInjected = true;

  const SIDEBAR_W = 348;

  const ICON = {
    target:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    bolt:
      '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    layers:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    send:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    logo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0H5a2 2 0 0 1-2-2v-4m6 6h10a2 2 0 0 0 2-2v-4"/></svg>',
  };

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    #oc-layer { position: fixed; inset: 0; pointer-events: none; z-index: 1; }
    #oc-highlight {
      position: fixed; display: none; pointer-events: none; z-index: 2;
      border: 2px solid #4c8dff; background: rgba(76,141,255,0.14);
      border-radius: 3px; box-shadow: 0 0 0 1px rgba(0,0,0,.4);
      transition: all .04s ease-out;
    }
    #oc-hint {
      position: fixed; top: 18px; left: calc(50% - ${SIDEBAR_W / 2}px);
      transform: translateX(-50%); z-index: 3;
      display: none; gap: 10px; align-items: center; pointer-events: none;
      font: 13px system-ui, sans-serif; color: #e6e8ee;
      background: rgba(20,22,30,.94); padding: 8px 14px; border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.08);
    }
    #oc-hint .key { font-size: 11px; background: rgba(255,255,255,.14); padding: 2px 7px; border-radius: 5px; }

    #oc-sidebar {
      position: fixed; top: 0; right: 0; height: 100vh; width: ${SIDEBAR_W}px;
      pointer-events: auto; display: flex; flex-direction: column; z-index: 4;
      background: #16171d; color: #e6e8ee;
      font: 13.5px/1.5 system-ui, -apple-system, sans-serif;
      border-left: 1px solid rgba(255,255,255,.08);
      box-shadow: -12px 0 40px rgba(0,0,0,.45);
    }
    #oc-sidebar header {
      display: flex; align-items: center; gap: 9px;
      padding: 14px 14px; border-bottom: 1px solid rgba(255,255,255,.07);
    }
    #oc-sidebar header .logo { width: 18px; height: 18px; color: #4c8dff; flex: none; }
    #oc-sidebar header .title { font-weight: 650; font-size: 13.5px; flex: 1; letter-spacing: .2px; }
    .iconbtn {
      display: inline-flex; align-items: center; justify-content: center;
      border: none; background: transparent; color: #8b90a0; cursor: pointer;
      width: 30px; height: 30px; border-radius: 8px; padding: 0;
    }
    .iconbtn svg { width: 16px; height: 16px; }
    .iconbtn:hover { background: rgba(255,255,255,.07); color: #e6e8ee; }

    .oc-actions { padding: 12px 14px 6px; }
    button.primary {
      font: inherit; font-weight: 600; width: 100%;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 12px; border-radius: 10px; cursor: pointer;
      color: #fff; background: #3f7dff; border: 1px solid #3f7dff;
      transition: background .15s, transform .05s;
    }
    button.primary svg { width: 16px; height: 16px; }
    button.primary:hover:not(:disabled) { background: #3670f0; }
    button.primary:active:not(:disabled) { transform: translateY(1px); }
    button.primary:disabled { opacity: .4; cursor: default; }
    #oc-pick.active { background: #e0632a; border-color: #e0632a; }

    #oc-list { flex: 1; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 10px; }
    #oc-list::-webkit-scrollbar { width: 10px; }
    #oc-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 6px; border: 3px solid #16171d; }
    .oc-empty { color: #71768a; font-size: 12.5px; padding: 26px 8px; text-align: center; line-height: 1.6; }

    .oc-card {
      background: #1f2129; border: 1px solid rgba(255,255,255,.08); border-radius: 12px;
      padding: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.3);
    }
    .oc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .oc-desc {
      font: 11.5px ui-monospace, monospace; color: #aeb4c6;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      background: rgba(255,255,255,.06); padding: 3px 8px; border-radius: 6px; flex: 1;
    }
    .oc-card textarea {
      width: 100%; resize: vertical; min-height: 46px; font: inherit;
      border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 8px 9px;
      background: #14151b; color: #e6e8ee;
    }
    .oc-card textarea::placeholder { color: #616678; }
    .oc-card textarea:focus { outline: none; border-color: #4c8dff; box-shadow: 0 0 0 3px rgba(76,141,255,.18); }
    .oc-modes { display: flex; gap: 6px; margin-top: 8px; }
    .oc-mode {
      font: inherit; font-size: 12px; font-weight: 600; flex: 1;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 6px 8px; border-radius: 8px; cursor: pointer;
      background: rgba(255,255,255,.05); color: #9298aa; border: 1px solid transparent;
    }
    .oc-mode svg { width: 13px; height: 13px; }
    .oc-mode:hover { background: rgba(255,255,255,.09); color: #cfd3df; }
    .oc-mode.sel { background: rgba(76,141,255,.16); color: #7aa9ff; border-color: rgba(76,141,255,.4); }

    #oc-sidebar footer { padding: 12px 14px 14px; border-top: 1px solid rgba(255,255,255,.07); position: relative; }
    .oc-status { font-size: 12px; margin-bottom: 9px; display: flex; align-items: center; gap: 8px; color: #9298aa; }
    .oc-status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #5b6070; flex: none; }
    .oc-status.good::before { background: #34d399; box-shadow: 0 0 8px rgba(52,211,153,.6); }
    .oc-status.warn::before { background: #fbbf24; }
    .oc-status.bad::before { background: #f87171; }
    .oc-status.checking::before { background: #60a5fa; }
    .oc-status.good { color: #34d399; }
    .oc-status.warn { color: #fbbf24; }
    .oc-status.bad { color: #f87171; }

    .oc-toast {
      position: absolute; left: 14px; right: 14px; bottom: 62px;
      background: #0e0f14; color: #fff; font-size: 12.5px;
      padding: 9px 12px; border-radius: 9px; opacity: 0; transform: translateY(6px);
      transition: opacity .2s, transform .2s; pointer-events: none;
      box-shadow: 0 10px 30px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.08);
    }
    .oc-toast.show { opacity: 1; transform: translateY(0); }
    .oc-toast.bad { border-color: rgba(248,113,113,.5); color: #fca5a5; }
  `;

  let host = null;
  let root = null;
  let picking = false;
  let annotations = [];
  let statusTimer = null;
  let visible = false;

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
    const id = el.testId
      ? `[data-testid=${el.testId}]`
      : el.id
        ? `#${el.id}`
        : el.ariaLabel
          ? `[${el.ariaLabel}]`
          : el.classes && el.classes.length
            ? `.${el.classes[0]}`
            : "";
    return `${tag}${id}`;
  }

  // ---------- picking (layer is always pointer-events:none; read the real
  // element from the event's composed path, which pierces shadow DOM) ----------

  function pickTarget(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const n of path) {
      if (n === host) return null; // our UI wrapper
      if (!(n instanceof Element)) continue;
      if (root && root.contains(n)) return null; // hovering our own UI
      const inShadow = n.getRootNode && n.getRootNode() instanceof ShadowRoot;
      return { el: n, inShadow };
    }
    return null;
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
    if (!hit) {
      const box = root.getElementById("oc-highlight");
      if (box) box.style.display = "none";
      return;
    }
    positionHighlight(hit.el);
  }

  function onClick(e) {
    if (!picking) return;
    const hit = pickTarget(e);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    stopPicking();
    addCardForElement(elementMeta(hit.el, hit.inShadow));
  }

  function onKey(e) {
    if (e.key === "Escape") {
      if (picking) stopPicking();
      else toggle();
    }
  }

  function startPicking() {
    picking = true;
    document.documentElement.style.cursor = "crosshair";
    root.getElementById("oc-hint").style.display = "flex";
    setPickBtn(true);
  }

  function stopPicking() {
    picking = false;
    document.documentElement.style.cursor = "";
    const box = root.getElementById("oc-highlight");
    if (box) box.style.display = "none";
    root.getElementById("oc-hint").style.display = "none";
    setPickBtn(false);
  }

  function setPickBtn(active) {
    const btn = root.getElementById("oc-pick");
    if (btn) {
      btn.innerHTML = `${ICON.target}<span>${active ? "Picking… (Esc)" : "Select element"}</span>`;
      btn.classList.toggle("active", active);
    }
  }

  // ---------- cards ----------

  function addCardForElement(element) {
    annotations.push({ instruction: "", mode: "act", page: { url: location.href, title: document.title }, element });
    renderCards();
    const areas = root.querySelectorAll(".oc-card textarea");
    const last = areas[areas.length - 1];
    if (last) last.focus();
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function renderCards() {
    const list = root.getElementById("oc-list");
    list.innerHTML = "";
    if (annotations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "oc-empty";
      empty.textContent = "No annotations yet. Click “Select element”, then click something on the page.";
      list.appendChild(empty);
    }
    annotations.forEach((a, i) => {
      const card = document.createElement("div");
      card.className = "oc-card";
      card.innerHTML = `
        <div class="oc-card-head">
          <span class="oc-desc" title="${escapeHtml(a.element.selector || "")}">${escapeHtml(shortDescriptor(a.element))}</span>
          <button class="iconbtn oc-rm" data-i="${i}" title="Remove">${ICON.trash}</button>
        </div>
        <textarea rows="2" placeholder="Instruction for this element…" data-i="${i}">${escapeHtml(a.instruction)}</textarea>
        <div class="oc-modes">
          <button class="oc-mode ${a.mode === "act" ? "sel" : ""}" data-mode="act" data-i="${i}">${ICON.bolt}<span>Act now</span></button>
          <button class="oc-mode ${a.mode === "queue" ? "sel" : ""}" data-mode="queue" data-i="${i}">${ICON.layers}<span>Queue</span></button>
        </div>`;
      list.appendChild(card);
    });
    updateSubmit();
  }

  function updateSubmit() {
    const btn = root.getElementById("oc-submit");
    btn.disabled = annotations.length === 0;
    btn.querySelector("span").textContent = annotations.length
      ? `Submit ${annotations.length} to agent`
      : "Submit to agent";
  }

  // ---------- status ----------

  function refreshStatus() {
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
          const q = res.data.queued ? ` · ${res.data.queued} queued` : "";
          el.className = "oc-status good";
          el.textContent = `Connected${q}`;
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

  // ---------- UI ----------

  function buildUI() {
    host = document.createElement("div");
    host.id = "oc-annotation-host";
    host.style.cssText = "all: initial;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <div id="oc-layer"></div>
      <div id="oc-highlight"></div>
      <div id="oc-hint"><span>Hover an element and click to annotate</span><span class="key">Esc</span></div>
      <aside id="oc-sidebar">
        <header>
          <span class="logo">${ICON.logo}</span>
          <span class="title">OpenCode Annotation</span>
          <button id="oc-close" class="iconbtn" title="Close (Alt+A)">${ICON.close}</button>
        </header>
        <div class="oc-actions"><button id="oc-pick" class="primary">${ICON.target}<span>Select element</span></button></div>
        <div id="oc-list"></div>
        <footer>
          <div id="oc-status" class="oc-status">…</div>
          <button id="oc-submit" class="primary" disabled>${ICON.send}<span>Submit to agent</span></button>
          <div id="oc-toast" class="oc-toast"></div>
        </footer>
      </aside>`;
    document.documentElement.appendChild(host);

    root.getElementById("oc-pick").addEventListener("click", () => (picking ? stopPicking() : startPicking()));
    root.getElementById("oc-close").addEventListener("click", () => toggle());
    root.getElementById("oc-submit").addEventListener("click", submit);
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
  }

  function pushPage(on) {
    const el = document.documentElement;
    el.style.transition = "margin-right .22s ease";
    el.style.marginRight = on ? `${SIDEBAR_W}px` : "";
  }

  function open() {
    if (!host) buildUI();
    else host.style.display = "";
    pushPage(true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    if (!statusTimer) statusTimer = setInterval(refreshStatus, 15000);
    refreshStatus();
  }

  function close() {
    stopPicking();
    pushPage(false);
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    if (host) host.style.display = "none";
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  }

  function toggle() {
    visible = !visible;
    if (visible) open();
    else close();
  }

  window.addEventListener("oc-annotation-toggle", toggle);
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "oc-toggle") toggle();
  });

  // First injection opens immediately.
  visible = true;
  open();
})();
