// ConsentGuard AI - background.js v2
// Replace YOUR_RENDER_URL with your actual Render URL

const BACKEND_URL = "https://consentguard-ai-dw7a.onrender.com/api/analyze"; // ← change to your Render URL

function getRootDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

function getPolicyURLs(domain) {
  const base = `https://${domain}`;
  return [
    `${base}/privacy`,
    `${base}/privacy-policy`,
    `${base}/privacy_policy`,
    `${base}/legal/privacy`,
    `${base}/policies/privacy`,
    `${base}/about/privacy`,
    `${base}/en/privacy`,
  ];
}

async function fetchPolicyText(domain) {
  for (const url of getPolicyURLs(domain)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const html = await res.text();
      const clean = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ").trim();
      if (clean.length > 500) return { text: clean.slice(0, 300000), policyUrl: url };
    } catch { continue; }
  }
  return null;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || tab.url.startsWith("chrome://")) return;

  const domain = getRootDomain(tab.url);
  if (!domain) return;

  const cacheKey = `domain:${domain}`;
  const existing = await chrome.storage.local.get([cacheKey]);
  if (existing[cacheKey]?.status === "done") {
    const score = existing[cacheKey].result.score;
    updateBadge(tabId, String(score), getBadgeColor(score));
    return;
  }

  chrome.storage.local.set({ [cacheKey]: { status: "analyzing" } });
  updateBadge(tabId, "...", "#6366f1");

  const found = await fetchPolicyText(domain);
  if (!found) {
    chrome.storage.local.set({ [cacheKey]: { status: "not_found" } });
    updateBadge(tabId, "?", "#475569");
    return;
  }

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: found.policyUrl, text: found.text })
    });
  const data = await res.json();
chrome.storage.local.set({ [cacheKey]: { status: "done", result: data, policyUrl: found.policyUrl } });
updateBadge(tabId, String(data.score), getBadgeColor(data.score));
  } catch (err) {
    console.error("ConsentGuard error:", err);
    chrome.storage.local.set({ [cacheKey]: { status: "error" } });
    updateBadge(tabId, "!", "#ef4444");
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return;
  const domain = getRootDomain(tab.url);
  if (!domain) return;
  const cacheKey = `domain:${domain}`;
  const existing = await chrome.storage.local.get([cacheKey]);
  const entry = existing[cacheKey];
  if (!entry) return;
  if (entry.status === "done") updateBadge(tabId, String(entry.result.score), getBadgeColor(entry.result.score));
  else if (entry.status === "analyzing") updateBadge(tabId, "...", "#6366f1");
  else if (entry.status === "not_found") updateBadge(tabId, "?", "#475569");
  else if (entry.status === "error") updateBadge(tabId, "!", "#ef4444");
});

function updateBadge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

function getBadgeColor(score) {
  score = Number(score);
  if (score >= 9) return "#7f1d1d";
  if (score >= 7) return "#ef4444";
  if (score >= 4) return "#f59e0b";
  return "#22c55e";
}
