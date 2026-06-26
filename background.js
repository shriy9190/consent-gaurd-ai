// background.js — service worker, calls your Flask backend

const BACKEND_URL = "http://localhost:5000/api/analyze";

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "ANALYZE_POLICY") return;

  const { url, text } = message;
  const tabId = sender.tab?.id;

  // Mark tab as "analyzing"
  chrome.storage.local.set({ [url]: { status: "analyzing" } });
  if (tabId) updateBadge(tabId, "...", "#6366f1");

  fetch(BACKEND_URL, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ url, text })
  })
    .then(res => res.json())
    .then(data => {
      // Save result keyed by URL
      chrome.storage.local.set({
        [url]: { status: "done", result: data }
      });

      // Update badge with score
      if (tabId) {
        const color = getBadgeColor(data.score);
        updateBadge(tabId, String(data.score), color);
      }
    })
    .catch(err => {
      console.error("ConsentGuard fetch failed:", err);
      chrome.storage.local.set({ [url]: { status: "error" } });
      if (tabId) updateBadge(tabId, "!", "#ef4444");
    });
});

function updateBadge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

function getBadgeColor(score) {
  if (score >= 9) return "#7f1d1d"; // CRITICAL — dark red
  if (score >= 7) return "#ef4444"; // HIGH     — red
  if (score >= 4) return "#f59e0b"; // MEDIUM   — amber
  return "#22c55e";                  // LOW      — green
}
