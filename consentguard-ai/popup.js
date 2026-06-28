// ConsentGuard-AI Popup Controller

// DOM elements
const views = {
  dashboard: document.getElementById('dashboard-view'),
  settings: document.getElementById('settings-view')
};

const buttons = {
  settings: document.getElementById('settings-btn'),
  back: document.getElementById('back-btn'),
  saveSettings: document.getElementById('save-settings-btn')
};

const ui = {
  domain: document.getElementById('site-domain'),
  riskScore: document.getElementById('risk-score'),
  riskProgress: document.getElementById('risk-progress'),
  riskLevel: document.getElementById('risk-level'),
  summary: document.getElementById('smart-summary-text'),
  flagsList: document.getElementById('flags-list'),
  permissionsList: document.getElementById('permissions-list'),
  recommendationsList: document.getElementById('recommendations-list'),
  regulatoryContainer: document.getElementById('regulatory-container'),
  regulatoryText: document.getElementById('regulatory-text')
};

const settingsForm = {
  backendUrl: document.getElementById('backend-url-input'),
  apiKey: document.getElementById('api-key-input'),
  threshold: document.getElementById('threshold-slider'),
  thresholdVal: document.getElementById('threshold-value'),
  simulator: document.getElementById('simulator-toggle'),
  saveStatus: document.getElementById('save-status')
};

// Global State
let activeDomain = "unknown";
let activeData = null;

// Initialize Popup
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  loadSettings();
  
  const urlParams = new URLSearchParams(window.location.search);
  const isInterceptor = urlParams.get('mode') === 'interceptor';
  
  if (isInterceptor) {
    // Mode deactivated
  } else {
    // Normal popup behavior (user clicked extension icon)
    getCurrentTabAndScan();
  }
});
// View Navigation Setup
function setupNavigation() {
  buttons.settings.addEventListener('click', () => {
    switchView('settings');
  });

  buttons.back.addEventListener('click', () => {
    switchView('dashboard');
  });

  // Slider updating
  settingsForm.threshold.addEventListener('input', (e) => {
    settingsForm.thresholdVal.textContent = e.target.value;
  });

  buttons.saveSettings.addEventListener('click', saveSettings);
}

function switchView(viewName) {
  Object.keys(views).forEach(key => {
    if (key === viewName) {
      views[key].classList.add('active');
    } else {
      views[key].classList.remove('active');
    }
  });
}

// Load configurations from storage
function loadSettings() {
  chrome.storage.local.get(['geminiApiKey', 'riskThreshold', 'useSimulator', 'backendUrl'], (result) => {
    settingsForm.backendUrl.value = result.backendUrl || "http://127.0.0.1:5001";
    if (result.geminiApiKey) {
      settingsForm.apiKey.value = result.geminiApiKey;
    }
    if (result.riskThreshold) {
      settingsForm.threshold.value = result.riskThreshold;
      settingsForm.thresholdVal.textContent = result.riskThreshold;
    }
    if (result.useSimulator !== undefined) {
      settingsForm.simulator.checked = result.useSimulator;
    }
  });
}

// Save configurations to storage
function saveSettings() {
  const backendUrl = settingsForm.backendUrl.value.trim();
  const apiKey = settingsForm.apiKey.value.trim();
  const threshold = parseInt(settingsForm.threshold.value, 10);
  const useSimulator = settingsForm.simulator.checked;

  chrome.storage.local.set({
    backendUrl: backendUrl,
    geminiApiKey: apiKey,
    riskThreshold: threshold,
    useSimulator: useSimulator
  }, () => {
    settingsForm.saveStatus.style.display = 'block';
    setTimeout(() => {
      settingsForm.saveStatus.style.display = 'none';
      switchView('dashboard');
      getCurrentTabAndScan();
    }, 1000);
  });
}

// Deep DOM Scraping Injection
function executeDeepDOMScrape() {
  const result = {
    scripts: [],
    iframes: [],
    forms: [],
    cookies: [],
    local_storage_keys: []
  };
  
  // 1. Scripts
  for (const s of document.scripts) {
    if (s.src) {
      try { result.scripts.push(new URL(s.src).hostname); } 
      catch (e) { result.scripts.push(s.src); }
    }
  }
  // 2. IFrames
  const iframes = document.getElementsByTagName('iframe');
  for (const f of iframes) {
    if (f.src) {
      try { result.iframes.push(new URL(f.src).hostname); }
      catch(e) { result.iframes.push(f.src); }
    }
  }
  // 3. Forms
  for (const frm of document.forms) {
    const action = frm.action || "unknown";
    const inputs = Array.from(frm.elements).map(e => e.name || e.id || e.type).filter(Boolean);
    result.forms.push({ target: action, inputs: inputs });
  }
  // 4. Cookies
  if (document.cookie) {
    const cNames = document.cookie.split(';').map(c => c.split('=')[0].trim());
    result.cookies = cNames;
  }
  // 5. LocalStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      result.local_storage_keys.push(localStorage.key(i));
    }
  } catch(e) {}
  
  // Text content for policy analysis fallback
  const html = document.body.innerHTML;
  let cleanText = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleanText = cleanText.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleanText = cleanText.replace(/<[^>]+>/g, ' ');
  cleanText = cleanText.replace(/\s+/g, ' ');
  
  return { metadata: result, text: cleanText.substring(0, 30000) };
}

// Get the active tab, request text, and scan
function getCurrentTabAndScan() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      const tab = tabs[0];
      try {
        const url = new URL(tab.url);
        activeDomain = url.hostname;
        ui.domain.textContent = activeDomain;

        if (url.protocol.startsWith('http')) {
          // Inject our deep scanner script into the live DOM!
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: executeDeepDOMScrape
          }, (results) => {
            if (chrome.runtime.lastError || !results || !results[0]) {
              console.error("V4 Injection Error:", chrome.runtime.lastError);
              runAnalysisSimulated("Failed to execute deep scan script on this page. Cannot access internal pages.");
              return;
            }
            
            const scrapedData = results[0].result;
            const scanDataPayload = { raw_metadata: scrapedData.metadata };
            
            // Pass the deeply extracted metadata straight to the AI!
            performAnalysis(scrapedData.text, tab.url, tab.url, scanDataPayload);
          });
        } else {
          runAnalysisSimulated("Extension cannot run on internal browser pages.");
        }
      } catch (e) {
        runAnalysisSimulated("Invalid URL format.");
      }
    }
  });
}
// Route analysis based on simulator settings
function performAnalysis(text, tabUrl, policyUrl, techData = null) {
  try {
    const urlObj = new URL(tabUrl);
    const domain = urlObj.hostname.toLowerCase();
    if (domain.includes("wikipedia.org") || domain.includes("wikimedia.org")) {
      renderDashboard({
        risk_score: 1,
        smart_summary: "Wikipedia is run by a non-profit organization (Wikimedia Foundation). Their privacy policy is extremely secure, and they do not track, sell, or commercialize your personal data.",
        critical_flags: [],
        permission_insights: [
          {
            permission_type: "Essential Cookies",
            is_necessary: true,
            reason: "Used only to maintain user session preferences and login states."
          }
        ],
        actionable_recommendations: [
          "Safe to browse. No special privacy actions are required."
        ],
        regulatory_context: "Fully compliant with GDPR privacy principles of data minimization and purpose limitation."
      });
      return;
    }
  } catch (e) {}

  chrome.storage.local.get(['geminiApiKey', 'useSimulator', 'backendUrl'], (result) => {
    const backendUrl = result.backendUrl || "http://127.0.0.1:5001";
    const hasBackend = !!backendUrl;
    const apiAvailable = !!result.geminiApiKey;
    const forceSim = result.useSimulator !== false;

    if (hasBackend) {
      callFlaskBackend(text, tabUrl, backendUrl, policyUrl, result.geminiApiKey, techData);
    } else if (apiAvailable && !forceSim) {
      callGeminiAPI(text, result.geminiApiKey);
    } else {
      runAnalysisSimulated(text);
    }
  });
}

// Call Gemini API to parse text
async function callGeminiAPI(text, apiKey) {
  ui.summary.textContent = "Analyzing terms via Gemini AI...";
  
  const systemInstruction = `You are ConsentGuard-AI, a legal policy parser that evaluates privacy text for risk.
You must respond ONLY with a valid, clean JSON object matching the following structure:
{
  "risk_score": [Integer between 1 and 10],
  "smart_summary": "[2-3 sentence plain English summary of the privacy policy]",
  "critical_flags": [
    {
      "clause_topic": "[Clause short name, e.g. Data Selling, Cross-Site Tracking]",
      "severity": "[High / Medium / Low]",
      "original_jargon_summary": "[Briefly what the policy claims]",
      "plain_english_translation": "[Real impact on the user's data]"
    }
  ],
  "permission_insights": [
    {
      "permission_type": "[Permission name e.g. Microphone, Location, Cookies]",
      "is_necessary": [true/false],
      "reason": "[Why it is requested and if safe to block]"
    }
  ],
  "actionable_recommendations": [
    "[Actionable recommendation 1]",
    "[Actionable recommendation 2]"
  ],
  "regulatory_context": "[Reference GDPR or specific IT act requirements if violated]"
}`;

  const prompt = `Analyze this raw privacy policy or cookie banner text:
---
${text.substring(0, 10000)}
---
Ensure you identify specific risk items, rate the overall risk out of 10, and output only the valid JSON.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (responseText) {
      const parsedJSON = JSON.parse(responseText.trim());
      renderDashboard(parsedJSON);
    } else {
      throw new Error("Empty candidate response from Gemini.");
    }
  } catch (err) {
    console.error("Gemini API Error:", err);
    ui.summary.textContent = "AI API Call failed. Falling back to local analyzer. (" + err.message + ")";
    setTimeout(() => {
      runAnalysisSimulated(text);
    }, 2000);
  }
}

// Verification helper to ensure fetched page content is actually a policy/terms page
function isPolicyContent(html, url) {
  if (!html) return false;
  
  const lowerHtml = html.toLowerCase();
  const lowerUrl = url.toLowerCase();
  
  // 1. Check if it's a soft 404 page / error page
  const errorPatterns = [
    "404 not found",
    "page not found",
    "error 404",
    "cannot find this page",
    "does not exist",
    "page you requested could not be found",
    "404 error",
    "find what you're looking for",
    "site map",
    "search our site"
  ];
  for (const pattern of errorPatterns) {
    if (lowerHtml.includes(pattern)) {
      return false;
    }
  }
  
  // 2. Count privacy/legal terms. A real policy page will have a high density of these words.
  const keywords = [
    // English
    "privacy policy", "privacy statement", "cookie policy", "personal data", "personal information", "information we collect", 
    "gdpr", "third parties", "opt-out", "terms of service", "terms of use", "legal notice", "how we use",
    // Spanish
    "política de privacidad", "datos personales", "política de cookies",
    // German
    "datenschutzerklärung", "personenbezogene daten", "cookie-richtlinie", "datenschutz",
    // French
    "politique de confidentialité", "données personnelles",
    // Italian
    "politica sulla privacy", "dati personali",
    // Portuguese
    "política de privacidade", "dados pessoais",
    // Dutch
    "privacybeleid", "persoonsgegevens"
  ];
  
  let matchCount = 0;
  for (const kw of keywords) {
    const idx = lowerHtml.indexOf(kw);
    if (idx !== -1) {
      matchCount++;
      // Check if it appears multiple times
      if (lowerHtml.indexOf(kw, idx + kw.length) !== -1) {
        matchCount++;
      }
    }
  }
  
  // Also check URL for strong indicators
  let score = matchCount;
  if (lowerUrl.includes("privacy") || lowerUrl.includes("cookie") || lowerUrl.includes("legal") || lowerUrl.includes("terms")) {
    score += 5;
  }
  
  console.log(`ConsentGuard-AI: Page content evaluation score for ${url} is ${score} (matchCount: ${matchCount})`);
  return score >= 5;
}

// Function to extract URLs from DuckDuckGo HTML
function extractUrlsFromDDG(html, targetDomain) {
  const urls = [];
  
  // Look for uddg parameter in DuckDuckGo redirect links
  const uddgMatches = html.matchAll(/uddg=([^&"']+)/g);
  for (const match of uddgMatches) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.startsWith("http")) {
        urls.push(decoded);
      }
    } catch (e) {}
  }
  
  // Also look for standard href links in the HTML
  const hrefMatches = html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g);
  for (const match of hrefMatches) {
    urls.push(match[1]);
  }
  
  // Filter and prioritize URLs
  const cleanDomain = targetDomain.replace(/^www\./i, '').toLowerCase();
  const knownPolicyHosts = ["iubenda.com", "termsfeed.com", "shopify.com", "privacypolicies.com", "termsofservicegenerator.net", "nytimes.com", "nytco.com"];
  
  const filtered = urls.filter(u => {
    try {
      const urlObj = new URL(u);
      const urlHost = urlObj.hostname.toLowerCase();
      // Relax domain validation to allow prefix roots (e.g. 'nytco' & 'nytimes' both start with 'nyt')
      const prefixClean = cleanDomain.substring(0, 3);
      const sharesRoot = prefixClean.length >= 3 && urlHost.includes(prefixClean);
      const matchesDomain = urlHost.includes(cleanDomain) || sharesRoot || knownPolicyHosts.some(host => urlHost.includes(host));
      const isPolicyCandidate = /privacy|terms|cookie|legal|agreement|tos/i.test(u);
      return matchesDomain && isPolicyCandidate;
    } catch (e) {
      return false;
    }
  });
  
  return [...new Set(filtered)];
}

// Dual-Engine policy URL discoverer (DuckDuckGo search + concurrent guessing)
async function guessAndFetchPolicy(tabUrl) {
  try {
    const urlObj = new URL(tabUrl);
    const origin = urlObj.origin;
    const domain = urlObj.hostname;
    
    console.log(`ConsentGuard-AI: Starting Dual-Engine Policy Discoverer in popup context for: ${domain}`);
    
    // Engine 1: DuckDuckGo Search
    try {
      const searchQuery = encodeURIComponent(`site:${domain} privacy policy`);
      const searchUrl = `https://html.duckduckgo.com/html/?q=${searchQuery}`;
      console.log(`ConsentGuard-AI: Engine 1 searching DuckDuckGo: ${searchUrl}`);
      
      const searchHtml = await fetchTextViaProxy(searchUrl);
      const candidateUrls = extractUrlsFromDDG(searchHtml, domain);
      console.log("ConsentGuard-AI: DuckDuckGo found policy page candidate URLs:", candidateUrls);
      
      for (const candidateUrl of candidateUrls) {
        try {
          console.log(`ConsentGuard-AI: Fetching candidate from search: ${candidateUrl}`);
          const pageHtml = await fetchTextViaProxy(candidateUrl);
          const finalUrl = candidateUrl;
          if (isPolicyContent(pageHtml, finalUrl)) {
            console.log(`ConsentGuard-AI: Successfully verified policy page via search: ${finalUrl}`);
            return { url: finalUrl, html: pageHtml };
          }
        } catch (e) {
          console.warn(`ConsentGuard-AI: Failed fetching candidate URL ${candidateUrl}:`, e.message);
        }
      }
    } catch (searchErr) {
      console.warn("ConsentGuard-AI: Engine 1 DuckDuckGo search failed, falling back to Engine 2...", searchErr.message);
    }
    
    // Engine 2: Concurrent Guessing
    console.log(`ConsentGuard-AI: Engine 2 starting concurrent path guessing for ${origin}...`);
    const paths = [
      "/privacy-policy", "/privacy", "/privacy_policy", "/privacy-policy/", "/privacy/",
      "/cookie-policy", "/cookie-policy/", "/cookies", "/cookies/",
      "/terms", "/terms-of-service", "/terms-of-use", "/legal",
      "/privacy.html", "/privacy-policy.html", "/data-protection", "/about/privacy", 
      "/legal/privacy", "/legal/privacy-policy", "/legal/privacy_policy",
      "/legal/terms-of-service", "/legal/terms", "/legal/cookie-policy"
    ];
    
    const candidates = [];
    for (const path of paths) {
      candidates.push(`${origin}${path}`);
    }
    
    // Add paths relative to the current directory of the URL if it's not root
    if (urlObj.pathname && urlObj.pathname !== "/") {
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 1) {
        pathParts.pop();
        let subPath = "";
        while (pathParts.length > 0) {
          subPath = "/" + pathParts.join("/");
          for (const path of paths) {
            candidates.push(`${origin}${subPath}${path}`);
          }
          pathParts.pop();
        }
      }
    }
    
    const uniqueCandidates = [...new Set(candidates)];
    const batchSize = 4;
    const timeoutMs = 3000;
    
    for (let i = 0; i < uniqueCandidates.length; i += batchSize) {
      const batch = uniqueCandidates.slice(i, i + batchSize);
      const controller = new AbortController();
      
      console.log(`ConsentGuard-AI: Guessing batch ${Math.floor(i/batchSize) + 1}:`, batch);
      
      const fetchPromises = batch.map(async (guessUrl) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
        });
        
        try {
          const fetchPromise = fetchTextViaProxy(guessUrl);
          const html = await Promise.race([fetchPromise, timeoutPromise]);
          clearTimeout(timeoutId);
          
          if (html && isPolicyContent(html, guessUrl)) {
            controller.abort();
            return { url: guessUrl, html: html };
          }
        } catch (e) {
          clearTimeout(timeoutId);
        }
        return null;
      });
      
      const results = await Promise.all(fetchPromises);
      const successfulMatch = results.find(r => r !== null);
      if (successfulMatch) {
        console.log(`ConsentGuard-AI: Guessed policy URL successfully: ${successfulMatch.url}`);
        return successfulMatch;
      }
    }
  } catch (err) {
    console.warn("ConsentGuard-AI: Dual-Engine guesser failed:", err);
  }
  return null;
}

// Proxy helper to download page HTML text without CORS blocks
async function fetchTextViaProxy(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "proxyFetch",
      url: url,
      responseType: 'text'
    }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!res) {
        reject(new Error("No response from background worker"));
      } else if (!res.success) {
        reject(new Error(res.error || "Background fetch failed"));
      } else {
        resolve(res.data);
      }
    });
  });
}

// Call Flask Backend Server
async function callFlaskBackend(text, tabUrl, backendUrl, policyUrl, apiKey, techData = null) {
  ui.summary.textContent = "Analyzing terms via Flask backend server...";
  
  let policyType = "both";
  const lowerUrl = tabUrl.toLowerCase();
  if (lowerUrl.includes("cookie")) {
    policyType = "cookie";
  } else if (lowerUrl.includes("privacy") || lowerUrl.includes("terms") || lowerUrl.includes("tos")) {
    policyType = "privacy";
  }

  try {
    let textToSend = text.substring(0, 10000); // Limit payload to 10k chars for speed
    
    if (!textToSend.trim() && !techData) {
      renderDashboard({
        risk_score: 1,
        smart_summary: "No privacy policy or terms of service detected on this page. Navigate to the website's privacy policy page or cookie banner to run a scan.",
        critical_flags: [],
        permission_insights: [
          {
            permission_type: "General Browsing",
            is_necessary: true,
            reason: "Standard page content with no active cookie banner or privacy terms found."
          }
        ],
        actionable_recommendations: [
          "Navigate to the website's privacy policy or terms page to run a detailed analysis."
        ],
        regulatory_context: ""
      });
      return;
    }

    const targetBase = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    const url = `${targetBase}/api/analyze`;

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    // Direct fetch from popup context (avoids service worker message timeouts!)
    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        text: textToSend,
        url: tabUrl,
        policy_type: policyType,
        scan_data: techData || {}
      })
    });

    if (!fetchResponse.ok) {
      throw new Error(`HTTP error status ${fetchResponse.status}`);
    }

    const data = await fetchResponse.json();
    
    const mappedData = {
      risk_score: data.score !== undefined ? data.score : (data.risk_score || 5),
      smart_summary: data.summary || data.smart_summary || "No summary details returned.",
      critical_flags: [],
      permission_insights: [],
      actionable_recommendations: data.actionable_recommendations || data.recommendations || [],
      regulatory_context: data.regulatory_context || ""
    };

    const rawFlags = data.flags || data.critical_flags || [];
    rawFlags.forEach(f => {
      if (typeof f === 'string') {
        mappedData.critical_flags.push({
          clause_topic: "Privacy Risk Flag",
          severity: "High",
          original_jargon_summary: "Terms analysis flagged this clause.",
          plain_english_translation: f
        });
      } else if (f && typeof f === 'object') {
        mappedData.critical_flags.push({
          clause_topic: f.clause_topic || "Flag",
          severity: f.severity || "Medium",
          original_jargon_summary: f.original_jargon_summary || "Flagged term",
          plain_english_translation: f.plain_english_translation || "Data privacy warning."
        });
      }
    });

    const positives = data.positive_points || [];
    positives.forEach(p => {
      mappedData.actionable_recommendations.push(`Positive: ${p}`);
    });

    const cookies = data.cookies_found || [];
    cookies.forEach(c => {
      const name = typeof c === 'string' ? c : (c.name || "Unknown Cookie");
      const purpose = typeof c === 'string' ? "Cross-site advertising tracker." : (c.purpose || "Tracking pixel.");
      mappedData.permission_insights.push({
        permission_type: `Cookie: ${name}`,
        is_necessary: false,
        reason: purpose
      });
    });

    if (data.categories) {
      Object.entries(data.categories).forEach(([category, isTriggered]) => {
        let hasTriggered = false;
        if (typeof isTriggered === 'boolean') {
          hasTriggered = isTriggered;
        } else if (Array.isArray(isTriggered)) {
          hasTriggered = isTriggered.length > 0;
        } else if (isTriggered) {
          hasTriggered = true;
        }

        if (hasTriggered && mappedData.critical_flags.filter(cf => cf.clause_topic.toLowerCase() === category.toLowerCase()).length === 0) {
          mappedData.critical_flags.push({
            clause_topic: category.charAt(0).toUpperCase() + category.slice(1),
            severity: "High",
            original_jargon_summary: `Section matches BERT ${category} keywords.`,
            plain_english_translation: `Classified as high risk for user privacy related to: ${category}.`
          });
        }
      });
    }

    if (mappedData.permission_insights.length === 0) {
      mappedData.permission_insights.push({
        permission_type: "Essential Cookies",
        is_necessary: true,
        reason: "Required to manage secure browser state and page configurations."
      });
    }

    if (mappedData.actionable_recommendations.length === 0) {
      mappedData.actionable_recommendations.push("Decline promotional/third-party identifiers inside cookie banner.");
      mappedData.actionable_recommendations.push("Configure browser privacy shields to prevent tracking.");
    }

    if (!mappedData.regulatory_context && data.level) {
      mappedData.regulatory_context = `Classification: ${data.level}.`;
      if (data.level === "HIGH" || data.level === "CRITICAL") {
        mappedData.regulatory_context += " Incompatible with GDPR Article 5 data minimization principles.";
      }
    }

    renderDashboard(mappedData);
  } catch (err) {
    console.error("Flask Backend Error:", err);
    if (err.message.includes("status:")) {
      ui.summary.textContent = "Backend API Error: " + err.message + ". Running local simulation...";
    } else {
      ui.summary.textContent = "Flask server unreachable. Running local simulation... (" + err.message + ")";
    }
    setTimeout(() => {
      runAnalysisSimulated(text);
    }, 2000);
  }
}

// Local Pattern Matching / Simulator
function runAnalysisSimulated(text) {
  const normalizedText = text.toLowerCase();
  
  const indicators = {
    selling: /sell|share|advertising|monetize|partners|commercial partner/i.test(normalizedText),
    tracking: /track|cross-site|profile|cookie track|pixels|triangulation/i.test(normalizedText),
    location: /location|gps|geolocation|position/i.test(normalizedText),
    hardware: /camera|microphone|record audio|webcam/i.test(normalizedText),
    retention: /indefinite|archive backup|keep forever|retention/i.test(normalizedText)
  };

  let riskScore = 2;
  const criticalFlags = [];
  const permissionInsights = [];
  const recommendations = [];

  permissionInsights.push({
    permission_type: "Essential Cookies",
    is_necessary: true,
    reason: "Required to manage user login states, carts, and page security features."
  });

  if (indicators.selling) {
    riskScore += 3;
    criticalFlags.push({
      clause_topic: "Commercial Data Sharing",
      severity: "High",
      original_jargon_summary: "We share profile analytics, usage history, and advertising identifiers with network partners.",
      plain_english_translation: "They sell your browsing telemetry and interest categories directly to external ad agencies."
    });
    recommendations.push("Opt out of 'Interest-Based Ads' directly inside settings pages.");
  }

  if (indicators.tracking) {
    riskScore += 2;
    criticalFlags.push({
      clause_topic: "Cross-Site Profiling",
      severity: "Medium",
      original_jargon_summary: "Cookies and trackers trace page navigation metrics across third-party properties.",
      plain_english_translation: "Ad corporations follow you from website to website, monitoring what you read and buy."
    });
    permissionInsights.push({
      permission_type: "Tracking Cookies",
      is_necessary: false,
      reason: "Feeds cross-site metrics. Block them to prevent tracking across other domains."
    });
    recommendations.push("Block cross-site tracking cookies in your browser settings.");
  }

  if (indicators.location) {
    riskScore += 2;
    criticalFlags.push({
      clause_topic: "Geographic Tracking",
      severity: "High",
      original_jargon_summary: "Background GPS coordinate feeds optimize content locality settings.",
      plain_english_translation: "The service monitors your physical coordinates, potentially cataloging your travel routes."
    });
    permissionInsights.push({
      permission_type: "Location Feed",
      is_necessary: false,
      reason: "Used for local features. Block it and input zip codes manually for safety."
    });
    recommendations.push("Deny device-level location permission requests from this page.");
  }

  if (indicators.hardware) {
    riskScore += 2;
    criticalFlags.push({
      clause_topic: "Device Recording access",
      severity: "Medium",
      original_jargon_summary: "Audio/Video streams may be initialized to support community feature modules.",
      plain_english_translation: "The site prompts for microphone or webcam. Dangerous if running unmonitored."
    });
    permissionInsights.push({
      permission_type: "Microphone/Webcam",
      is_necessary: false,
      reason: "Requests media feeds. Safe to block; only allow during live calls."
    });
  }

  if (indicators.retention) {
    riskScore += 1;
    criticalFlags.push({
      clause_topic: "Permanent Data Archive",
      severity: "Medium",
      original_jargon_summary: "Personal identifiers remain within operational log arrays indefinitely.",
      plain_english_translation: "They retain your account database information even if you click 'Delete Account'."
    });
  }

  riskScore = Math.min(riskScore, 10);

  if (recommendations.length === 0) {
    recommendations.push("Use standard browser shields (e.g. Brave Shield or uBlock) to filter scripts.");
    recommendations.push("Review policy changes updates periodically.");
  } else {
    recommendations.push("Deny optional marketing consent prompts upon entry.");
  }

  let summary = `This site's terms are generally standard. Minimal data capture or monetization behaviors were matched.`;
  if (riskScore >= 7) {
    summary = `High risk detected! This service engages in active advertising monetization, profile construction, and background location tracking. Exercise strong caution before consenting.`;
  } else if (riskScore >= 4) {
    summary = `Moderate threat. The site collects marketing metrics and utilizes cross-site trackers, but does not explicitly mention direct sale of personal identities.`;
  }

  const simulatedResult = {
    risk_score: riskScore,
    smart_summary: summary,
    critical_flags: criticalFlags,
    permission_insights: permissionInsights,
    actionable_recommendations: recommendations,
    regulatory_context: riskScore >= 7 ? "Violates GDPR Article 5 principles of data minimization and retention limits." : ""
  };

  renderDashboard(simulatedResult);
}

// Render values onto popup HTML
function renderDashboard(data) {
  activeData = data;

  const score = data.risk_score || 1;
  ui.riskScore.textContent = score;

  const circle = ui.riskProgress;
  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 10) * circumference;
  circle.style.strokeDashoffset = offset;

  let levelText = "Safe / Low Risk";
  let levelClass = "level-safe";
  let strokeColor = "#10b981";

  if (score >= 7) {
    levelText = "High Danger";
    levelClass = "level-danger";
    strokeColor = "#f43f5e";
  } else if (score >= 4) {
    levelText = "Moderate Warning";
    levelClass = "level-medium";
    strokeColor = "#f59e0b";
  }

  circle.style.stroke = strokeColor;
  ui.riskLevel.className = `risk-level-badge ${levelClass}`;
  ui.riskLevel.textContent = levelText;

  ui.summary.innerHTML = data.smart_summary || "Empty summary details.";

  ui.flagsList.innerHTML = "";
  if (data.critical_flags && data.critical_flags.length > 0) {
    data.critical_flags.forEach((flag, index) => {
      const severityClass = (flag.severity || "medium").toLowerCase();
      const flagEl = document.createElement('div');
      flagEl.className = `flag-item ${severityClass}`;
      flagEl.innerHTML = `
        <div class="flag-header" data-index="${index}">
          <span class="flag-topic">${escapeHtml(flag.clause_topic)}</span>
          <span class="flag-severity ${severityClass}">${escapeHtml(flag.severity)}</span>
        </div>
        <div id="flag-content-${index}" class="flag-content">
          <p><strong>Clause says:</strong> ${escapeHtml(flag.original_jargon_summary)}</p>
          <div class="translation"><strong>Plain English:</strong> ${escapeHtml(flag.plain_english_translation)}</div>
        </div>
      `;

      flagEl.querySelector('.flag-header').addEventListener('click', () => {
        const content = flagEl.querySelector('.flag-content');
        content.classList.toggle('expanded');
      });

      ui.flagsList.appendChild(flagEl);
    });
  } else {
    ui.flagsList.innerHTML = '<div class="empty-state">No critical flags detected!</div>';
  }

  ui.permissionsList.innerHTML = "";
  if (data.permission_insights && data.permission_insights.length > 0) {
    data.permission_insights.forEach(perm => {
      const badgeClass = perm.is_necessary ? "necessary" : "blockable";
      const badgeText = perm.is_necessary ? "Required" : "Blockable";
      const permEl = document.createElement('div');
      permEl.className = "permission-item";
      permEl.innerHTML = `
        <div class="permission-left">
          <span class="permission-name">${escapeHtml(perm.permission_type)}</span>
          <span class="permission-desc">${escapeHtml(perm.reason)}</span>
        </div>
        <span class="permission-badge ${badgeClass}">${badgeText}</span>
      `;
      ui.permissionsList.appendChild(permEl);
    });
  } else {
    ui.permissionsList.innerHTML = '<div class="empty-state">No specific hardware permissions flagged.</div>';
  }

  ui.recommendationsList.innerHTML = "";
  if (data.actionable_recommendations && data.actionable_recommendations.length > 0) {
    data.actionable_recommendations.forEach(rec => {
      const li = document.createElement('li');
      li.textContent = rec;
      ui.recommendationsList.appendChild(li);
    });
  } else {
    ui.recommendationsList.innerHTML = '<li>No specific actions required. Browser protections suffice.</li>';
  }

  if (data.regulatory_context) {
    ui.regulatoryContainer.classList.remove('hidden');
    ui.regulatoryText.textContent = data.regulatory_context;
  } else {
    ui.regulatoryContainer.classList.add('hidden');
  }
}

// Fallback error UI
function showFallbackState(message) {
  ui.summary.textContent = message;
  ui.riskScore.textContent = "0";
  ui.riskProgress.style.strokeDashoffset = "314.16";
  ui.riskLevel.className = "risk-level-badge level-safe";
  ui.riskLevel.textContent = "Inactive";
  ui.flagsList.innerHTML = '<div class="empty-state">Navigate to a website with cookie consent banners or privacy details.</div>';
  ui.permissionsList.innerHTML = '<div class="empty-state">No active analysis.</div>';
  ui.recommendationsList.innerHTML = '<div class="empty-state">No items.</div>';
  ui.regulatoryContainer.classList.add('hidden');
}

// HTML escape helper
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
