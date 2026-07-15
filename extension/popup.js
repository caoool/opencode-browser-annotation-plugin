const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const pickBtn = document.getElementById("pick");
const clearBtn = document.getElementById("clear");
const submitBtn = document.getElementById("submit");

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

async function render() {
  const res = await send({ type: "oc-list" });
  const annotations = res?.annotations || [];
  listEl.innerHTML = "";
  submitBtn.disabled = annotations.length === 0;
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    const li = document.createElement("li");
    const instruction = (a.instruction || "(no instruction)").replace(/</g, "&lt;");
    const sel = (a.element?.selector || a.element?.tag || "").replace(/</g, "&lt;");
    li.innerHTML = `<span class="rm" data-i="${i}">✕</span><div>${instruction}</div><div class="sel">${sel}</div>`;
    listEl.appendChild(li);
  }
  listEl.querySelectorAll(".rm").forEach((el) => {
    el.addEventListener("click", async () => {
      await send({ type: "oc-remove", index: Number(el.dataset.i) });
      render();
    });
  });
}

pickBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    setStatus("Hover an element and click it. Esc to cancel.");
    window.close();
  } catch (error) {
    setStatus("Cannot inject here (e.g. chrome:// pages).");
  }
});

clearBtn.addEventListener("click", async () => {
  await send({ type: "oc-clear" });
  render();
});

submitBtn.addEventListener("click", async () => {
  submitBtn.disabled = true;
  setStatus("Submitting…");
  const res = await send({ type: "oc-submit" });
  if (res?.ok) {
    setStatus(`Sent ${res.count} annotation(s) to the agent.`);
    render();
  } else {
    setStatus(`Failed: ${res?.error || "unknown error"}`);
    submitBtn.disabled = false;
  }
});

document.getElementById("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
