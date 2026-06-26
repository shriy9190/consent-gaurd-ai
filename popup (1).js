// popup.js

const app = document.getElementById("app");

function getRingColor(score) {
  if (score >= 9) return "#dc2626";
  if (score >= 7) return "#ef4444";
  if (score >= 4) return "#f59e0b";
  return "#22c55e";
}

function renderAnalyzing() {
  app.innerHTML = `
    <div class="state">
      <div class="spinner"></div>
      Analyzing privacy policy…<br>This may take a few seconds.
    </div>`;
}

function renderNotPrivacy() {
  app.innerHTML = `
    <div class="state">
      <div class="icon">📄</div>
      This doesn't look like a privacy policy page.<br>
      Navigate to a privacy policy and it will be analyzed automatically.
    </div>`;
}

function renderError() {
  app.innerHTML = `
    <div class="state">
      <div class="icon">⚠️</div>
      Analysis failed. Make sure your backend is running at<br>
      <strong style="color:#6366f1">localhost:5000</strong>
    </div>`;
}

function toggleSection(id) {
  const body = document.getElementById(id);
  const icon = document.getElementById(id + "-icon");
  const open = body.classList.toggle("open");
  icon.textContent = open ? "▲" : "▼";
}

function makeSection(id, title, emoji, content) {
  return `
    <div class="section">
      <div class="section-header" onclick="toggleSection('${id}')">
        <span class="section-title">${emoji} ${title}</span>
        <span class="section-toggle" id="${id}-icon">▼</span>
      </div>
      <div class="section-body" id="${id}">
        ${content}
      </div>
    </div>`;
}

function renderResult(data) {
  const color  = getRingColor(data.score);
  const flags  = data.flags || [];
  const cats   = data.categories || {};
  const pos    = data.positive_points || [];

  // ── Flags section ──
  const flagsHtml = flags.length
    ? flags.map(f => `
        <div class="flag-item">
          <span class="flag-dot"></span>
          <span>${f}</span>
        </div>`).join("")
    : `<span class="empty">No red flags found.</span>`;

  // ── Categories section ──
  const catLabels = {
    data_collection: "What they collect",
    data_sharing   : "Who they share with",
    user_rights    : "Your rights",
    security       : "How they protect you"
  };
  let catsHtml = "";
  for (const [key, label] of Object.entries(catLabels)) {
    const items = cats[key] || [];
    catsHtml += `<div class="cat-label">${label}</div>`;
    catsHtml += items.length
      ? items.map(i => `<div class="cat-item">${i}</div>`).join("")
      : `<div class="cat-item empty">Nothing reported</div>`;
  }

  // ── Positive points section ──
  const posHtml = pos.length
    ? pos.map(p => `
        <div class="positive-item">
          <span class="positive-dot"></span>
          <span>${p}</span>
        </div>`).join("")
    : `<span class="empty">No positives found.</span>`;

  app.innerHTML = `
    <div class="score-section" style="--ring-color: ${color}">
      <div class="score-ring">
        <span class="score-num">${data.score}</span>
        <span class="score-denom">/10</span>
      </div>
      <div class="score-info">
        <div class="score-level">${data.level} RISK</div>
        <div class="score-summary">${data.summary || ""}</div>
      </div>
    </div>

    ${data.cached ? `<span class="cached-badge">⚡ Cached result</span>` : ""}

    ${makeSection("flags",      `Red Flags (${flags.length})`, "🚩", flagsHtml)}
    ${makeSection("categories", "Details",                      "📋", catsHtml)}
    ${makeSection("positives",  "Positives",                    "✅", posHtml)}
  `;
}

// ── Main: get current tab URL and look up storage ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url;
  if (!url) { renderNotPrivacy(); return; }

  chrome.storage.local.get([url], (items) => {
    const entry = items[url];

    if (!entry)                    { renderNotPrivacy();  return; }
    if (entry.status === "analyzing") { renderAnalyzing(); return; }
    if (entry.status === "error")     { renderError();     return; }
    if (entry.status === "done")      { renderResult(entry.result); return; }

    renderNotPrivacy();
  });
});
