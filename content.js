// content.js — runs on every page, detects privacy policies

const PRIVACY_KEYWORDS = [
  "privacy policy", "privacy notice", "data policy",
  "cookie policy", "terms of service", "data protection"
];

function isPrivacyPage() {
  const title = document.title.toLowerCase();
  const url   = window.location.href.toLowerCase();
  const h1    = document.querySelector("h1")?.innerText?.toLowerCase() || "";

  return PRIVACY_KEYWORDS.some(kw =>
    title.includes(kw) || url.includes(kw.replace(/ /g, "-")) ||
    url.includes(kw.replace(/ /g, "_")) || h1.includes(kw)
  );
}

function extractText() {
  // Remove nav, footer, script, style noise
  const noise = document.querySelectorAll("nav, footer, script, style, header, aside");
  noise.forEach(el => el.remove());

  const body = document.body?.innerText || "";
  return body.trim().slice(0, 300000); // max 300k chars
}

function run() {
  if (!isPrivacyPage()) return;

  const text = extractText();
  if (!text || text.length < 200) return;

  const url = window.location.href;

  // Send to background to call the backend
  chrome.runtime.sendMessage({
    type   : "ANALYZE_POLICY",
    url    : url,
    text   : text
  });
}

// Run once page is fully loaded
if (document.readyState === "complete") {
  run();
} else {
  window.addEventListener("load", run);
}
