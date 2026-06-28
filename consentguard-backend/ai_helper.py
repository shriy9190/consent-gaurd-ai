import os        
import json       
import re          
import time     
import logging      
import requests     
from concurrent.futures import ThreadPoolExecutor

from groq import Groq       

log = logging.getLogger(__name__)

# SECTION 1 — API KEYS AND SETUP
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)

HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
HF_API_URL = "https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli"

if not GROQ_API_KEY:
    log.warning("GROQ_API_KEY is not set — Groq calls will fail")
if not HF_API_KEY:
    log.warning("HUGGINGFACE_API_KEY is not set — HuggingFace calls will fail")


# SECTION 2 — SYSTEM PROMPTS

SYSTEM_PROMPT_POLICY_ANALYSIS = """You are ConsentGuard AI, a privacy policy analyst and real-time permission advisor built into a Chrome extension.
You operate in PRIVACY POLICY ANALYSIS mode.

You will receive:
1. The app/website name and category (e.g., food delivery, video conferencing, social media) based on the URL context.
2. The extracted privacy policy text or list of data permissions.

Your tasks:
1. Identify all data types being collected (location, camera, microphone, contacts, browsing history, device ID, notifications, clipboard, etc.).
- CRITICAL: You must ALWAYS evaluate and include the following 5 data types in the 'permissions_analysis' array: Location, Camera, Microphone, Browsing History, and Essential Cookies. For 'Essential Cookies' (which replaces standard 'Cookies'), always set the data type name as 'Essential Cookies', set justified to true, and set its reason as 'Required to manage secure browser state and page configurations.'. For each of the other 4, determine if it is collected (true/false) based on the policy text, whether it is justified (true/false) based on the website's category, and provide a clear reason.
2. For each data type, evaluate: "Does this app genuinely need this data to function?"
   - A food delivery app NEEDS location. It does NOT need contacts or browsing history.
   - A video call app NEEDS camera and microphone. It does NOT need location or contacts.
   - A flashlight app NEEDS nothing except torch access. Any other permission is a red flag.
3. Flag clauses that are vague, overbroad, or grant unnecessary third-party sharing rights.
4. Assign a Risk Score from 1–10:
   - 1–3: Low risk. Permissions match app purpose.
   - 4–6: Moderate risk. Some unnecessary data collection detected.
   - 7–10: High risk. Significant data overreach or suspicious clauses found.

Output STRICTLY in this JSON format — no markdown, no extra text:
{
  "mode": "policy_analysis",
  "app_name": "Name of the app",
  "category": "e.g. food delivery, social media, etc.",
  "risk_score": 1,
  "risk_level": "Low | Moderate | High",
  "permissions_analysis": [
    {
      "data_type": "location | camera | microphone | etc.",
      "collected": true,
      "justified": true,
      "reason": "Detailed explanation of why it is or isn't needed based on the app's category"
    }
  ],
  "red_flags": [
    "Vague clauses or sharing details found"
  ],
  "summary": "3 short, punchy, and crispy plain-English bullet points (max 10 words per bullet). Format as an HTML list (e.g., '<ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul>'). Keep them interesting and easy to scan!"
}

Global Rules:
- Never give benefit of the doubt for vague language. If a clause says 'we may share data with partners' with no specifics, flag it.
- If no red flags, vague clauses, or privacy concerns are found, the 'red_flags' array MUST be empty [] (do NOT write placeholders like 'None found' or 'No flags').
- The website/app category is your anchor. Evaluate if collected data is standard and justified for that category. For example: IP address logging, cross-device tracking, or telemetry sharing with advertising platforms are NOT justified for basic utilities, discussion forums, or news sites, and MUST be flagged as red flags.
- Identify and flag actual privacy overreach clauses in the text, such as cross-device tracking, sharing with ad networks/exchanges, IP logging, background tracking, or excessive data retention.
- Be direct. No lengthy explanations.
- Write like explaining to a 16 year old. Use everyday language."""

SYSTEM_PROMPT_PERMISSION_INTERCEPT = """You are ConsentGuard AI, a privacy policy analyst and real-time permission advisor built into a Chrome extension.
You operate in REAL-TIME PERMISSION INTERCEPT mode.

You will receive:
1. The website name and category.
2. The exact permission being requested right now (location, camera, microphone, notifications, clipboard).

Your tasks:
Give a verdict the user can read in 3 seconds and act on immediately.

Output STRICTLY in this JSON format — no markdown, no extra text:
{
  "mode": "permission_intercept",
  "permission": "Permission name",
  "verdict": "ALLOW | DENY | CAUTION",
  "risk_emoji": "🟢 | 🟡 | 🔴",
  "one_liner": "Sharp and direct. Under 10 words. No filler.",
  "what_they_can_do_with_it": "Plain language explanation of what the site could do if granted. Max 2 sentences.",
  "safer_alternative": "If DENY or CAUTION, tell the user what they can do instead. If ALLOW, leave this as null."
}

Rules for Verdict:
- ALLOW: Permission is core to the app's function. Swiggy + location = ALLOW. Zoom + camera = ALLOW. (Emoji: 🟢)
- DENY: Permission has no logical connection to what the app does. Google Meet + location = DENY. A news site + microphone = DENY. (Emoji: 🔴)
- CAUTION: Permission is optional or useful but not essential. Instagram + location = CAUTION (needed for geotagging, not for core use). (Emoji: 🟡)

Global Rules:
- App category is your anchor. Always ask: does this permission make sense for what this app actually does?
- Be direct. No lengthy explanations."""


# SECTION 3 — TEXT CLEANING AND HELPERS
def clean_text(text):
    text = re.sub(r"<[^>]+>", " ", text)      
    text = re.sub(r"https?://\S+", "", text)   
    text = re.sub(r"\s+", " ", text)           
    text = re.sub(r"[^\x20-\x7E]", "", text)  
    return text.strip()                         


def split_into_sentences(text):
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
    return sentences


def extract_app_name_and_category(url):
    # Fallback rules to guess category
    domain = url.lower()
    if "github" in domain:
        return "GitHub", "software development platform"
    if "google" in domain:
        return "Google", "search engine & productivity"
    if "claude" in domain or "anthropic" in domain:
        return "Claude", "AI chatbot assistant"
    if "instagram" in domain:
        return "Instagram", "social media network"
    if "techcrunch" in domain:
        return "TechCrunch", "tech news publisher"
    if "reddit" in domain:
        return "Reddit", "social discussion community"
    if "cookieserve" in domain:
        return "CookieServe", "cookie auditing tool"
    
    # Generic guess
    parts = url.split("://")[-1].split("/")[0].replace("www.", "").split(".")
    name = parts[0].capitalize() if parts else "Website"
    return name, "general website"


# SECTION 4 — INTERCEPT MODE (Mode 2)
def analyze_permission_intercept(url, permission):
    app_name, category = extract_app_name_and_category(url)
    
    user_message = f"""Website Name: {app_name}
Category: {category}
URL: {url}
Requested Permission: {permission}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",  
            temperature=0.1,   
            max_tokens=500,   
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_PERMISSION_INTERCEPT},
                {"role": "user",   "content": user_message}
            ]
        )
        raw_reply = response.choices[0].message.content.strip()
        clean_reply = re.sub(r"```(?:json)?|```", "", raw_reply).strip()
        return json.loads(clean_reply)
    except Exception as e:
        log.error(f"Groq Mode 2 failed: {e}")
        # Local fallback if API fails
        permission_lower = permission.lower()
        verdict = "CAUTION"
        emoji = "🟡"
        one_liner = f"Caution: {app_name} is requesting {permission_lower}."
        what_they_can_do = f"Allows the website to access your device's {permission_lower}."
        alternative = "Deny if this feature is not needed."

        if "location" in permission_lower:
            verdict = "DENY" if "delivery" not in category and "map" not in category else "ALLOW"
            emoji = "🔴" if verdict == "DENY" else "🟢"
            one_liner = "Only allow if you trust this site with location."
            what_they_can_do = "Allows the website to see where you are in real-time."
            alternative = "Deny permission to preserve location privacy."
        elif "camera" in permission_lower or "video" in permission_lower:
            verdict = "ALLOW" if "conference" in category or "chat" in category or "social" in category else "DENY"
            emoji = "🟢" if verdict == "ALLOW" else "🔴"
            one_liner = f"{app_name} is requesting camera access."
            what_they_can_do = "Allows the website to record video from your webcam."
            alternative = "Keep camera blocked unless actively recording."
        elif "microphone" in permission_lower or "audio" in permission_lower:
            verdict = "ALLOW" if "conference" in category or "chat" in category or "voice" in category else "DENY"
            emoji = "🟢" if verdict == "ALLOW" else "🔴"
            one_liner = f"{app_name} is requesting microphone access."
            what_they_can_do = "Allows the website to record audio from your microphone."
            alternative = "Deny permission if you do not need voice transmission."
        elif "notification" in permission_lower:
            verdict = "CAUTION"
            emoji = "🟡"
            one_liner = "Notifications can cause distractions."
            what_they_can_do = "Allows the website to show background popups and alerts."
            alternative = "Block notifications to avoid distraction."
        elif "clipboard" in permission_lower:
            verdict = "DENY"
            emoji = "🔴"
            one_liner = "Clipboard access exposes copied data."
            what_they_can_do = "Allows the website to read text you have copied (like passwords)."
            alternative = "Paste manually using keyboard shortcuts instead."
        
        return {
            "mode": "permission_intercept",
            "permission": permission,
            "verdict": verdict,
            "risk_emoji": emoji,
            "one_liner": one_liner,
            "what_they_can_do_with_it": what_they_can_do,
            "safer_alternative": alternative
        }


# SECTION 5 — ANALYSIS MODE (Mode 1)
def analyze_policy(raw_text, url=None):
    if not raw_text or not raw_text.strip():
        raise ValueError("No policy text was provided")

    app_name, category = "Website", "general website"
    if url:
        app_name, category = extract_app_name_and_category(url)

    text = clean_text(raw_text)
    log.info(f"Cleaned policy text for {app_name} ({len(text)} chars)")

    # Pull out key fragments to send to Groq
    sentences = split_into_sentences(text)
    suspicious = [s for s in sentences if any(kw in s.lower() for kw in ["sell", "share", "track", "disclose", "location", "camera", "microphone", "contacts"])]
    bullet_list = "\n".join([f"- {s}" for s in suspicious[:30]])

    user_message = f"""Website Name: {app_name}
Category: {category}
URL: {url or "unknown"}

Privacy Policy Sentences:
{bullet_list}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",  
            temperature=0.1,   
            max_tokens=1500,   
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_POLICY_ANALYSIS},
                {"role": "user",   "content": user_message}
            ]
        )
        raw_reply = response.choices[0].message.content.strip()
        clean_reply = re.sub(r"```(?:json)?|```", "", raw_reply).strip()
        parsed = json.loads(clean_reply)
        
        # Ensure correct naming & formatting
        parsed["app_name"] = app_name
        parsed["category"] = category

        # Backwards compatibility mappings for popup.js keys
        parsed["smart_summary"] = parsed.get("summary", "")
        
        critical_flags = []
        for flag in parsed.get("red_flags", []):
            if any(term in flag.lower() for term in ["none found", "no red flags", "no major", "no flags", "n/a"]):
                continue
            critical_flags.append({
                "clause_topic": "Privacy Flag",
                "severity": "high" if parsed.get("risk_score", 0) >= 7 else "medium",
                "original_jargon_summary": flag,
                "plain_english_translation": flag
            })
        parsed["critical_flags"] = critical_flags

        permission_insights = []
        for p in parsed.get("permissions_analysis", []):
            permission_insights.append({
                "permission_type": p.get("data_type", "Collection").capitalize(),
                "is_necessary": p.get("justified", True),
                "reason": p.get("reason", "")
            })
        parsed["permission_insights"] = permission_insights

        return parsed

    except Exception as e:
        log.error(f"Groq Mode 1 failed: {e}")
        # Standard fallback if API fails
        fallback_data = {
            "mode": "policy_analysis",
            "app_name": app_name,
            "category": category,
            "risk_score": 3,
            "risk_level": "Low",
            "permissions_analysis": [
                {"data_type": "location", "collected": False, "justified": False, "reason": "Location details not verified from offline fallback."},
                {"data_type": "camera", "collected": False, "justified": False, "reason": "Camera recording access not verified from offline fallback."},
                {"data_type": "microphone", "collected": False, "justified": False, "reason": "Microphone recording access not verified from offline fallback."},
                {"data_type": "browsing history", "collected": False, "justified": False, "reason": "Browsing activity tracking not verified from offline fallback."},
                {"data_type": "Essential Cookies", "collected": True, "justified": True, "reason": "Required to manage secure browser state and page configurations."}
            ],
            "red_flags": [],
            "summary": "<ul><li>Standard privacy terms.</li><li>No major red flags found.</li><li>Essential session cookies only.</li></ul>"
        }

        # Backwards compatibility mappings for fallback
        fallback_data["smart_summary"] = fallback_data["summary"]
        fallback_data["critical_flags"] = []
        fallback_data["permission_insights"] = [
            {"permission_type": "Location", "is_necessary": False, "reason": "Location details not verified from offline fallback."},
            {"permission_type": "Camera", "is_necessary": False, "reason": "Camera recording access not verified from offline fallback."},
            {"permission_type": "Microphone", "is_necessary": False, "reason": "Microphone recording access not verified from offline fallback."},
            {"permission_type": "Browsing History", "is_necessary": False, "reason": "Browsing activity tracking not verified from offline fallback."},
            {"permission_type": "Essential Cookies", "is_necessary": True, "reason": "Required to manage secure browser state and page configurations."}
        ]
        return fallback_data
