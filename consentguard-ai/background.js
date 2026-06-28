// Background script proxy to execute network queries
// Bypasses browser webpage Content Security Policy (CSP) and CORS

// Helper to strip HTML tags and extract clean text in Service Worker
function cleanHtmlToText(html) {
  if (!html) return "";
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
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
  const knownPolicyHosts = ["iubenda.com", "termsfeed.com", "shopify.com", "privacypolicies.com", "termsofservicegenerator.net"];
  
  const filtered = urls.filter(u => {
    try {
      const urlObj = new URL(u);
      const urlHost = urlObj.hostname.toLowerCase();
      const matchesDomain = urlHost.includes(cleanDomain) || knownPolicyHosts.some(host => urlHost.includes(host));
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
    
    console.log(`ConsentGuard-AI: Starting Dual-Engine Policy Discoverer for: ${domain}`);
    
    // Engine 1: DuckDuckGo Search
    try {
      const searchQuery = encodeURIComponent(`site:${domain} privacy policy`);
      const searchUrl = `https://html.duckduckgo.com/html/?q=${searchQuery}`;
      console.log(`ConsentGuard-AI: Engine 1 searching DuckDuckGo: ${searchUrl}`);
      
      const searchController = new AbortController();
      const searchTimeout = setTimeout(() => searchController.abort(), 4000);
      
      const searchRes = await fetch(searchUrl, {
        signal: searchController.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      clearTimeout(searchTimeout);
      
      if (searchRes.ok) {
        const searchHtml = await searchRes.text();
        const candidateUrls = extractUrlsFromDDG(searchHtml, domain);
        console.log("ConsentGuard-AI: DuckDuckGo found policy page candidate URLs:", candidateUrls);
        
        for (const candidateUrl of candidateUrls) {
          try {
            console.log(`ConsentGuard-AI: Fetching candidate from search: ${candidateUrl}`);
            const pageController = new AbortController();
            const pageTimeout = setTimeout(() => pageController.abort(), 3000);
            
            const pageRes = await fetch(candidateUrl, { signal: pageController.signal });
            clearTimeout(pageTimeout);
            
            if (pageRes.ok) {
              const pageHtml = await pageRes.text();
              const finalUrl = pageRes.url || candidateUrl;
              if (isPolicyContent(pageHtml, finalUrl)) {
                console.log(`ConsentGuard-AI: Successfully verified policy page via search: ${finalUrl}`);
                return { url: finalUrl, html: pageHtml };
              }
            }
          } catch (e) {
            console.warn(`ConsentGuard-AI: Failed fetching candidate URL ${candidateUrl}:`, e.message);
          }
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
        pathParts.pop(); // Remove leaf page/folder
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
        const signal = controller.signal;
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
        });
        
        try {
          const fetchPromise = fetch(guessUrl, { signal, method: 'GET' });
          const res = await Promise.race([fetchPromise, timeoutPromise]);
          clearTimeout(timeoutId);
          
          if (res && res.ok) {
            const contentType = res.headers.get("content-type") || "";
            if (contentType.toLowerCase().includes("html") || contentType.toLowerCase().includes("text")) {
              const html = await res.text();
              const finalUrl = res.url || guessUrl;
              if (isPolicyContent(html, finalUrl)) {
                controller.abort(); // Cancel other requests in this batch
                return { url: finalUrl, html: html };
              }
            }
          }
        } catch (e) {
          clearTimeout(timeoutId);
          // Individual request failed or aborted
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "proxyFetch") {
    fetch(request.url, {
      method: request.method || 'GET',
      headers: request.headers,
      body: request.body
    })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error status ${res.status}`);
      return request.responseType === 'text' ? res.text() : res.json();
    })
    .then(data => sendResponse({ success: true, data: data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (request.action === "analyzePolicyOnServer") {
    chrome.storage.local.get(['backendUrl', 'geminiApiKey'], (result) => {
      const backendUrl = result.backendUrl || "http://127.0.0.1:5001";
      const apiKey = result.geminiApiKey || "";
      const targetBase = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const url = `${targetBase}/api/analyze`;
      
      let policyType = "both";
      const lowerUrl = request.url.toLowerCase();
      if (lowerUrl.includes("cookie")) {
        policyType = "cookie";
      } else if (lowerUrl.includes("privacy") || lowerUrl.includes("terms") || lowerUrl.includes("tos")) {
        policyType = "privacy";
      }

      const isCurrentPolicy = /privacy|terms|cookie|tos|legal|agreement/i.test(request.url);

      // Core logic: Fetch policy text
      let fetchPromise;
      if (request.policyUrl && !isCurrentPolicy) {
        // Case 1: Link was found on page - fetch it
        fetchPromise = fetch(request.policyUrl)
          .then(res => {
            if (!res.ok) throw new Error("Link fetch failed");
            return res.text();
          })
          .then(html => {
            if (!isPolicyContent(html, request.policyUrl)) {
              throw new Error("Fetched page is not a valid privacy policy page");
            }
            return { url: request.policyUrl, html: html };
          })
          .catch(err => {
            console.warn(`ConsentGuard-AI: Fetching direct policyUrl failed or invalid (${err.message}). Running guesser...`);
            return guessAndFetchPolicy(request.url);
          });
      } else if (!isCurrentPolicy) {
        // Case 2: Link NOT found on homepage - guess standard paths!
        fetchPromise = guessAndFetchPolicy(request.url);
      } else {
        // Case 3: Already on a policy page - fetch the page itself to extract text
        fetchPromise = fetch(request.url)
          .then(res => {
            if (!res.ok) throw new Error("Current page fetch failed");
            return res.text();
          })
          .then(html => ({ url: request.url, html: html }))
          .catch(() => Promise.resolve(null));
      }

      fetchPromise
        .then(fetchResult => {
          if (fetchResult && fetchResult.html) {
            const extractedText = cleanHtmlToText(fetchResult.html);
            const truncatedText = extractedText.substring(0, 30000);
            const combinedText = (request.bannerText + "\n\n" + truncatedText).trim();
            return sendToBackend(url, combinedText, request.url, policyType, apiKey);
          } else {
            // Fallback - send banner text only
            return sendToBackend(url, request.bannerText || "No text scraped.", request.url, policyType, apiKey);
          }
        })
        .then(data => {
          sendResponse({ success: true, data: data });
        })
        .catch(err => {
          console.error("ConsentGuard Worker Fetch/Analyze Error:", err);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true; // Keep message channel active for async callback
  }

  if (request.action === "analyzePermissionOnServer") {
    chrome.storage.local.get(['backendUrl', 'geminiApiKey'], (result) => {
      const backendUrl = result.backendUrl || "http://127.0.0.1:5001";
      const targetBase = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const url = `${targetBase}/api/analyze`;

      const headers = { 'Content-Type': 'application/json' };
      if (result.geminiApiKey) {
        headers['X-API-Key'] = result.geminiApiKey;
      }

      fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          url: request.url,
          permission: request.permission
        })
      })
      .then(res => {
        if (!res.ok) throw new Error(`Backend error status ${res.status}`);
        return res.json();
      })
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => {
        console.error("ConsentGuard Worker Permission Intercept Error:", err);
        sendResponse({ success: false, error: err.message });
      });
    });
    return true; // Keep message channel active for async callback
  }
});

// Helper function to send POST requests to the Flask server
function sendToBackend(apiUrl, text, tabUrl, policyType, apiKey) {
  const postBody = {
    text: text,
    url: tabUrl,
    policy_type: policyType
  };

  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  return fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(postBody)
  })
  .then(res => {
    if (!res.ok) throw new Error(`Backend error status ${res.status}`);
    return res.json();
  });
}

// --- V2 Architecture Background Handlers ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'v2_check_allowed') {
    chrome.storage.local.get(['allowedDomains'], (res) => {
      const allowed = res.allowedDomains || [];
      sendResponse({ allowed: allowed.includes(request.domain) });
    });
    return true;
  }
  if (request.action === 'v2_allow_domain') {
    chrome.storage.local.get(['allowedDomains'], (res) => {
      const allowed = res.allowedDomains || [];
      if (!allowed.includes(request.domain)) {
        allowed.push(request.domain);
        chrome.storage.local.set({ allowedDomains: allowed });
      }
    });
  }
  if (request.action === 'v2_perform_scan') {
    chrome.storage.local.get(['backendUrl', 'geminiApiKey'], (result) => {
      const backendUrl = result.backendUrl || 'http://127.0.0.1:5001';
      const targetBase = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const url = targetBase + '/api/analyze';
      const headers = { 'Content-Type': 'application/json' };
      if (result.geminiApiKey) headers['X-API-Key'] = result.geminiApiKey;

      fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          url: request.url,
          text: request.pageText,
          scan_data: request.scan_data
        })
      })
      .then(res => res.json())
      .then(data => sendResponse(data))
      .catch(err => {
        console.error('V2 Scan Error:', err);
        sendResponse(null);
      });
    });
    return true;
  }
  if (request.action === 'v3_static_scan') {
    chrome.storage.local.get(['backendUrl', 'geminiApiKey'], async (result) => {
      try {
        // Step 3: Background Worker Fetches the Destination Site
        const pageRes = await fetch(request.url);
        const html = await pageRes.text();
        
        // Step 4: Scan the fetched HTML as a string
        const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(m => {
          try { return new URL(m[1]).hostname; } catch(e) { return m[1]; }
        });
        const iframes = [...html.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)].map(m => {
          try { return new URL(m[1]).hostname; } catch(e) { return m[1]; }
        });
        const inputs = [...html.matchAll(/<input[^>]*name=["']([^"']+)["']/gi)].map(m => m[1]);

        const scan_data = {
          raw_metadata: {
            scripts: [...new Set(scripts)],
            iframes: [...new Set(iframes)],
            forms: inputs.map(name => ({ name, type: "unknown" })),
            cookies: [], 
            local_storage_keys: [],
            session_storage_keys: [],
            inline_suspicious_apis: []
          }
        };

        // Send to Flask Backend
        const backendUrl = result.backendUrl || 'http://127.0.0.1:5001';
        const targetBase = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
        const apiPath = targetBase + '/api/analyze';
        const headers = { 'Content-Type': 'application/json' };
        if (result.geminiApiKey) headers['X-API-Key'] = result.geminiApiKey;

        const aiRes = await fetch(apiPath, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            url: request.url,
            text: cleanHtmlToText(html).substring(0, 30000), // send text for policy parsing if available inline
            scan_data: scan_data
          })
        });
        
        const data = await aiRes.json();
        sendResponse(data);
      } catch (err) {
        console.error('V3 Static Scan Error:', err);
        sendResponse(null);
      }
    });
    return true;
  }
// Page interception completely disabled.
// Extension operates strictly via user-invoked popup scanning.
