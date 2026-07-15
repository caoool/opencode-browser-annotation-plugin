// Overlay content script. All UI lives inside one shadow root so host-page CSS
// cannot interfere and ours cannot leak. Nothing pushes the page.
//
// Interactions:
//   Alt+A        -> start element picking (background sends "oc-pick")
//   Alt+Shift+A  -> toggle the list sidebar ("oc-toggle-sidebar")
// Picking an element opens a floating popup near it (onUI-style): type an
// instruction, choose Act/Queue, then Add (to the sidebar list) or Send (submit
// immediately). The sidebar is a floating rounded card holding pending
// annotations for batch submit.

(() => {
  if (window.__ocAnnotationInjected) return;
  window.__ocAnnotationInjected = true;

  const ICON = {
    target:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    send:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    logo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0H5a2 2 0 0 1-2-2v-4m6 6h10a2 2 0 0 0 2-2v-4"/></svg>',
  };

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .oc-hl {
      position: fixed; display: none; pointer-events: none; z-index: 2147483644;
      border: 2px solid #4c8dff; background: rgba(76,141,255,0.14);
      border-radius: 3px; box-shadow: 0 0 0 1px rgba(0,0,0,.4); transition: all .04s ease-out;
    }
    .oc-hint {
      position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 2147483646;
      display: none; gap: 10px; align-items: center; pointer-events: none;
      font: 13px system-ui, sans-serif; color: #e6e8ee;
      background: rgba(18,20,28,.95); padding: 8px 14px; border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.08);
    }
    .oc-hint .key { font-size: 11px; background: rgba(255,255,255,.14); padding: 2px 7px; border-radius: 5px; }

    /* shared surface */
    .oc-surface {
      background: rgba(20,22,30,.98); color: #e6e8ee; border: 1px solid rgba(255,255,255,.1);
      border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.5);
      font: 13.5px/1.5 system-ui, -apple-system, sans-serif;
    }
    .oc-head { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-bottom: 1px solid rgba(255,255,255,.07); }
    .oc-head .logo { width: 17px; height: 17px; color: #4c8dff; flex: none; }
    .oc-head .title { font-weight: 650; font-size: 13px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .oc-path { font: 11px ui-monospace, monospace; color: #8b90a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .iconbtn { display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; color: #8b90a0; cursor: pointer; width: 28px; height: 28px; border-radius: 8px; padding: 0; }
    .iconbtn svg { width: 15px; height: 15px; }
    .iconbtn:hover { background: rgba(255,255,255,.08); color: #e6e8ee; }

    textarea.oc-ta {
      width: 100%; resize: vertical; min-height: 62px; font: inherit;
      border: 1px solid rgba(255,255,255,.12); border-radius: 9px; padding: 9px 10px;
      background: #14151b; color: #e6e8ee;
    }
    textarea.oc-ta::placeholder { color: #616678; }
    textarea.oc-ta:focus { outline: none; border-color: #4c8dff; box-shadow: 0 0 0 3px rgba(76,141,255,.18); }


    .btn { font: inherit; font-weight: 600; font-size: 12.5px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 8px 12px; border-radius: 9px; cursor: pointer; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #e6e8ee; transition: background .15s, transform .05s; }
    .btn svg { width: 15px; height: 15px; }
    .btn:hover:not(:disabled) { background: rgba(255,255,255,.1); }
    .btn:active:not(:disabled) { transform: translateY(1px); }
    .btn:disabled { opacity: .4; cursor: default; }
    .btn.primary { background: #3f7dff; border-color: #3f7dff; color: #fff; }
    .btn.primary:hover:not(:disabled) { background: #3670f0; }

    /* popup */
    .oc-popup { position: fixed; z-index: 2147483647; width: 320px; pointer-events: auto; }
    .oc-popup .oc-body { padding: 11px 12px; }
    .oc-popup .oc-foot { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,.07); }
    .oc-popup .oc-foot .btn { flex: 1; }
    .oc-hintline { font-size: 11px; color: #6a6f80; margin-top: 8px; text-align: center; }

    /* sidebar (floating card at right, not pinned) */
    .oc-sidebar { position: fixed; top: 16px; right: 16px; bottom: 16px; width: 330px; z-index: 2147483645; display: flex; flex-direction: column; pointer-events: auto; overflow: hidden; }
    .oc-sidebar .badge { font-size: 11px; font-weight: 700; color: #7aa9ff; background: rgba(76,141,255,.16); border-radius: 999px; padding: 1px 8px; }
    .oc-list { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 9px; }
    .oc-list::-webkit-scrollbar { width: 10px; }
    .oc-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 6px; border: 3px solid transparent; background-clip: content-box; }
    .oc-empty { color: #71768a; font-size: 12.5px; padding: 24px 8px; text-align: center; line-height: 1.6; }
    .oc-card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 11px; padding: 9px 10px; }
    .oc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .oc-desc { font: 11px ui-monospace, monospace; color: #aeb4c6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(255,255,255,.06); padding: 2px 7px; border-radius: 6px; flex: 1; }
    .oc-card .oc-text { font-size: 12.5px; color: #d4d7e0; white-space: pre-wrap; word-break: break-word; }
    .oc-foot-bar { padding: 11px 12px; border-top: 1px solid rgba(255,255,255,.07); position: relative; }
    .oc-target-row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
    .oc-target-label { font-size: 11px; font-weight: 600; color: #8b90a0; flex: none; }
    .oc-select { flex: 1; min-width: 0; font: inherit; font-size: 12px; color: #e6e8ee; background: #14151b; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 6px 8px; }
    .oc-select:focus { outline: none; border-color: #4c8dff; }
    .oc-status { font-size: 12px; margin-bottom: 9px; display: flex; align-items: center; gap: 8px; color: #9298aa; }
    .oc-status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #5b6070; flex: none; }
    .oc-status.good::before { background: #34d399; box-shadow: 0 0 8px rgba(52,211,153,.6); }
    .oc-status.warn::before { background: #fbbf24; } .oc-status.bad::before { background: #f87171; } .oc-status.checking::before { background: #60a5fa; }
    .oc-status.good { color: #34d399; } .oc-status.warn { color: #fbbf24; } .oc-status.bad { color: #f87171; }
    .oc-submit { width: 100%; }
    .oc-toast { position: absolute; left: 12px; right: 12px; bottom: 58px; background: #0e0f14; color: #fff; font-size: 12.5px; padding: 9px 12px; border-radius: 9px; opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s; pointer-events: none; box-shadow: 0 10px 30px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.08); }
    .oc-toast.show { opacity: 1; transform: translateY(0); }
    .oc-toast.bad { border-color: rgba(248,113,113,.5); color: #fca5a5; }
    .oc-toast-float { position: fixed; left: auto; right: 20px; bottom: 20px; width: auto; max-width: 320px; z-index: 2147483647; }
  `;

  let host = null;
  let root = null;
  let picking = false;
  let popupEl = null;
  let pending = []; // annotations added to the sidebar list
  let sidebarOpen = false;
  let statusTimer = null;
  let sessions = []; // [{ id, title, updated }]
  let targetSessionID = null; // user-chosen target; null = auto (last active)
  let autoSessionID = null; // the plugin's last-active session

  function effectiveTarget() {
    return targetSessionID || autoSessionID;
  }

  function targetTitle() {
    const id = effectiveTarget();
    const s = sessions.find((x) => x.id === id);
    return s ? s.title : null;
  }

  function targetLabel() {
    const t = targetTitle();
    return t ? ` · → ${escapeHtml(t)}` : "";
  }

  // ---------- metadata ----------

  function bestTestId(el) {
    for (const a of ["data-testid", "data-test", "data-test-id", "data-cy", "data-qa"]) {
      const v = el.getAttribute && el.getAttribute(a);
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
      const p = node.parentElement;
      if (p) {
        const sibs = Array.from(p.children).filter((c) => c.nodeName === node.nodeName);
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
    const m = {
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
    for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k];
    return m;
  }

  function descriptor(el) {
    const tag = (el.tag || "el").toLowerCase();
    const id = el.testId ? `[data-testid=${el.testId}]` : el.id ? `#${el.id}` : el.ariaLabel ? `[${el.ariaLabel}]` : el.classes && el.classes.length ? `.${el.classes[0]}` : "";
    return `${tag}${id}`;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---------- picking ----------

  function pickTarget(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const n of path) {
      if (n === host) return null;
      if (!(n instanceof Element)) continue;
      if (root && root.contains(n)) return null;
      const inShadow = n.getRootNode && n.getRootNode() instanceof ShadowRoot;
      return { el: n, inShadow };
    }
    return null;
  }

  function hl() {
    return root.getElementById("oc-hl");
  }

  function onMove(e) {
    if (!picking) return;
    const hit = pickTarget(e);
    const box = hl();
    if (!hit) {
      box.style.display = "none";
      return;
    }
    const r = hit.el.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  function onClick(e) {
    if (!picking) return;
    const hit = pickTarget(e);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const rect = hit.el.getBoundingClientRect();
    stopPicking();
    openPopup(elementMeta(hit.el, hit.inShadow), rect);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      if (popupEl) closePopup();
      else if (picking) stopPicking();
    }
  }

  function ensureUI() {
    if (host) return;
    host = document.createElement("div");
    host.id = "oc-annotation-host";
    host.style.cssText = "all: initial;";
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);
    const hlBox = document.createElement("div");
    hlBox.className = "oc-hl";
    hlBox.id = "oc-hl";
    root.appendChild(hlBox);
    const hint = document.createElement("div");
    hint.className = "oc-hint";
    hint.id = "oc-hint";
    hint.innerHTML = `<span>Click an element to annotate</span><span class="key">Esc</span>`;
    root.appendChild(hint);
    document.documentElement.appendChild(host);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function startPicking() {
    ensureUI();
    closePopup();
    picking = true;
    document.documentElement.style.cursor = "crosshair";
    root.getElementById("oc-hint").style.display = "flex";
  }

  function stopPicking() {
    picking = false;
    document.documentElement.style.cursor = "";
    if (root) {
      hl().style.display = "none";
      root.getElementById("oc-hint").style.display = "none";
    }
  }

  // ---------- popup (onUI-style, positioned near element) ----------

  function closePopup() {
    if (popupEl) {
      popupEl.remove();
      popupEl = null;
    }
  }

  function openPopup(element, rect) {
    ensureUI();
    closePopup();
    const el = document.createElement("div");
    el.className = "oc-popup oc-surface";
    el.innerHTML = `
      <div class="oc-head">
        <span class="logo">${ICON.logo}</span>
        <span class="oc-path" title="${escapeHtml(element.selector || "")}">${escapeHtml(descriptor(element))}</span>
        <button class="iconbtn oc-x" title="Cancel (Esc)">${ICON.close}</button>
      </div>
      <div class="oc-body">
        <textarea class="oc-ta" rows="3" placeholder="Describe the change or ask about this element…"></textarea>
        <div class="oc-hintline">Cmd/Ctrl+Enter to send${targetLabel()}</div>
      </div>
      <div class="oc-foot">
        <button class="btn oc-add">${ICON.plus}<span>Add to list</span></button>
        <button class="btn primary oc-send">${ICON.send}<span>Send</span></button>
      </div>`;
    root.appendChild(el);
    popupEl = el;
    positionPopup(el, rect);

    const ta = el.querySelector(".oc-ta");
    setTimeout(() => ta.focus(), 30);

    el.querySelector(".oc-x").addEventListener("click", closePopup);
    const build = () => ({ instruction: ta.value.trim(), page: { url: location.href, title: document.title }, element });
    el.querySelector(".oc-add").addEventListener("click", () => {
      if (!ta.value.trim()) return ta.focus();
      pending.push(build());
      closePopup();
      openSidebar();
    });
    el.querySelector(".oc-send").addEventListener("click", () => {
      if (!ta.value.trim()) return ta.focus();
      const one = build();
      closePopup();
      submit([one], true);
    });
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (ta.value.trim()) {
          const one = build();
          closePopup();
          submit([one], true);
        }
      }
    });
  }

  function positionPopup(el, rect) {
    const w = 320;
    const r = el.getBoundingClientRect();
    const h = r.height || 220;
    let left = rect.left + rect.width + 14;
    let top = rect.top;
    if (left + w > window.innerWidth - 16) left = rect.left - w - 14;
    if (left < 16) left = 16;
    if (top + h > window.innerHeight - 16) top = window.innerHeight - h - 16;
    if (top < 16) top = 16;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  // ---------- sidebar ----------

  function openSidebar() {
    ensureUI();
    sidebarOpen = true;
    let sb = root.getElementById("oc-sidebar");
    if (!sb) {
      sb = document.createElement("aside");
      sb.className = "oc-sidebar oc-surface";
      sb.id = "oc-sidebar";
      sb.innerHTML = `
        <div class="oc-head">
          <span class="logo">${ICON.logo}</span>
          <span class="title">Annotations</span>
          <span class="badge" id="oc-badge">0</span>
          <button class="iconbtn" id="oc-close" title="Close (Alt+Shift+A)">${ICON.close}</button>
        </div>
        <div class="oc-list" id="oc-list"></div>
        <div class="oc-foot-bar">
          <label class="oc-target-row">
            <span class="oc-target-label">Session</span>
            <select class="oc-select" id="oc-session"></select>
          </label>
          <div class="oc-status" id="oc-status">…</div>
          <button class="btn primary oc-submit" id="oc-submit" disabled>${ICON.send}<span>Submit to agent</span></button>
          <div class="oc-toast" id="oc-toast"></div>
        </div>`;
      root.appendChild(sb);
      sb.querySelector("#oc-close").addEventListener("click", closeSidebar);
      sb.querySelector("#oc-session").addEventListener("change", (e) => {
        targetSessionID = e.target.value || null;
      });
      sb.querySelector("#oc-submit").addEventListener("click", () => {
        submit(pending, false);
      });
      sb.querySelector("#oc-list").addEventListener("click", (e) => {
        const rm = e.target.closest(".oc-rm");
        if (rm) {
          pending.splice(Number(rm.dataset.i), 1);
          renderCards();
        }
      });
    }
    sb.style.display = "flex";
    renderCards();
    refreshStatus();
    if (!statusTimer) statusTimer = setInterval(refreshStatus, 15000);
  }

  function closeSidebar() {
    sidebarOpen = false;
    const sb = root && root.getElementById("oc-sidebar");
    if (sb) sb.style.display = "none";
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  }

  function toggleSidebar() {
    if (sidebarOpen) closeSidebar();
    else openSidebar();
  }

  function renderCards() {
    if (!root) return;
    const list = root.getElementById("oc-list");
    const badge = root.getElementById("oc-badge");
    if (badge) badge.textContent = String(pending.length);
    list.innerHTML = "";
    if (pending.length === 0) {
      const e = document.createElement("div");
      e.className = "oc-empty";
      e.textContent = "No annotations yet. Press Alt+A, click an element, and “Add to list”.";
      list.appendChild(e);
    }
    pending.forEach((a, i) => {
      const card = document.createElement("div");
      card.className = "oc-card";
      card.innerHTML = `
        <div class="oc-card-head">
          <span class="oc-desc" title="${escapeHtml(a.element.selector || "")}">${escapeHtml(descriptor(a.element))}</span>
          <button class="iconbtn oc-rm" data-i="${i}" title="Remove">${ICON.trash}</button>
        </div>
        <div class="oc-text">${escapeHtml(a.instruction || "(no instruction)")}</div>`;
      list.appendChild(card);
    });
    const btn = root.getElementById("oc-submit");
    if (btn) {
      btn.disabled = pending.length === 0;
      btn.querySelector("span").textContent = pending.length ? `Submit ${pending.length} to agent` : "Submit to agent";
    }
  }

  // ---------- status + submit ----------

  function refreshStatus() {
    if (!root) return;
    const el = root.getElementById("oc-status");
    if (!el) return;
    el.className = "oc-status checking";
    el.textContent = "Checking connection…";
    chrome.runtime.sendMessage({ type: "oc-status" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        el.className = "oc-status bad";
        el.textContent = "Extension error";
        return;
      }
      if (res.ok && res.data?.ok) {
        sessions = Array.isArray(res.data.sessions) ? res.data.sessions : [];
        autoSessionID = res.data.sessionID || null;
        renderSessions();
        if (sessions.length || res.data.activeSession) {
          el.className = "oc-status good";
          el.textContent = "Connected";
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

  function renderSessions() {
    if (!root) return;
    const sel = root.getElementById("oc-session");
    if (!sel) return;
    // If the chosen target vanished, fall back to auto.
    if (targetSessionID && !sessions.some((s) => s.id === targetSessionID)) targetSessionID = null;
    const current = effectiveTarget();
    const opts = [`<option value="">Auto (last active)</option>`].concat(
      sessions.map((s) => {
        const active = s.id === autoSessionID ? " • active" : "";
        const label = `${(s.title || s.id).slice(0, 40)}${active}`;
        const selected = s.id === current ? " selected" : "";
        return `<option value="${escapeHtml(s.id)}"${selected}>${escapeHtml(label)}</option>`;
      }),
    );
    // Keep "Auto" selected when no explicit target.
    sel.innerHTML = opts.join("");
    if (!targetSessionID) sel.value = "";
  }

  function toast(text, bad) {
    if (!root) return;
    // Prefer the sidebar's toast when it is open; otherwise use a standalone
    // floating toast so a quick Send never forces the sidebar open.
    const sb = root.getElementById("oc-sidebar");
    let t = sb && sb.style.display !== "none" ? root.getElementById("oc-toast") : root.getElementById("oc-toast-float");
    if (!t) {
      t = document.createElement("div");
      t.className = "oc-toast oc-toast-float";
      t.id = "oc-toast-float";
      root.appendChild(t);
    }
    t.textContent = text;
    t.className = (t.id === "oc-toast-float" ? "oc-toast oc-toast-float" : "oc-toast") + " show" + (bad ? " bad" : "");
    clearTimeout(t.__timer);
    t.__timer = setTimeout(() => {
      t.className = t.id === "oc-toast-float" ? "oc-toast oc-toast-float" : "oc-toast";
    }, 4000);
  }

  function submit(annotations, quick) {
    if (!annotations.length) return;
    toast("Submitting…");
    const sessionID = effectiveTarget() || undefined;
    chrome.runtime.sendMessage({ type: "oc-submit", annotations, sessionID }, (res) => {
      if (chrome.runtime.lastError || !res) {
        toast("Extension error", true);
        return;
      }
      if (res.ok) {
        const parts = [];
        if (res.injected) parts.push(`${res.injected} sent`);
        if (res.queued) parts.push(`${res.queued} queued`);
        toast(parts.length ? parts.join(", ") : "Submitted");
        if (!quick) {
          pending = [];
          renderCards();
        }
        refreshStatus();
      } else {
        toast(`Failed: ${res.error || "unknown"}`, true);
        if (!quick) {
          // keep the list so the user can retry
          renderCards();
        }
      }
    });
  }

  // ---------- messages ----------

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "oc-pick") startPicking();
    else if (msg?.type === "oc-toggle-sidebar") toggleSidebar();
  });
})();
