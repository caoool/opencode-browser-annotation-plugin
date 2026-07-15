const input = document.getElementById("endpoint");
const saved = document.getElementById("saved");
const DEFAULT_ENDPOINT = "http://127.0.0.1:39517";

chrome.storage.local.get("endpoint").then(({ endpoint }) => {
  input.value = endpoint || DEFAULT_ENDPOINT;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim() || DEFAULT_ENDPOINT;
  await chrome.storage.local.set({ endpoint: value });
  saved.textContent = "Saved.";
  setTimeout(() => (saved.textContent = ""), 1500);
});
