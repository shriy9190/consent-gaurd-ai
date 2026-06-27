import os        
import json       
import re          
import time     
import logging      
import requests     

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



# SECTION 2 — RISK CATEGORIES AND SCORE LABELS

RISK_CATEGORIES = {
    "selling user data"  : 2.0,  
    "location tracking"  : 1.8,
    "third party sharing": 1.6, 
    "device access"      : 1.5,  
    "behavioral tracking": 1.4,  
    "data retention"     : 1.2,  
    "user rights"        : 1.0,  
    "security practices" : 0.8,  
    "cookies"            : 0.6,  
    "irrelevant"         : 0.0,  
}  # ✅ closing brace was missing


SCORE_LABELS = [
    (9, 10, "CRITICAL"),  
    (7,  8, "HIGH"),    
    (4,  6, "MEDIUM"),    
    (1,  3, "LOW"),       
]



# SECTION 3 — TEXT CLEANING AND SENTENCE SPLITTING

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


# SECTION 4 — HUGGINGFACE BERT (THE HIGHLIGHTER)

MAX_SENTENCES_TO_CHECK    = 200  
HF_RETRY_ON_COLD_START    = 1     
HF_COLD_START_WAIT_SECONDS = 4


def classify_one_sentence(sentence, _retries=HF_RETRY_ON_COLD_START):
    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    truncated_text = sentence[:3500]
    payload = {
        "inputs": truncated_text,
        "parameters": {"candidate_labels": list(RISK_CATEGORIES.keys()),
            "multi_label": False
        }
    }

    try:
        response = requests.post(
            HF_API_URL,
            headers=headers,
            json=payload,
            timeout=15  
        )

        if response.status_code == 503 and _retries > 0:
            time.sleep(HF_COLD_START_WAIT_SECONDS)
            return classify_one_sentence(sentence, _retries=_retries - 1)

        result = response.json()

        if isinstance(result, list) and result and "label" in result [0]:
            best_label =result[0]["label"]
            best_score =result[0]["score"]
        elif isinstance( result , dict) and "labels" in result:
            best_label = result["labels"][0]
            best_score =result["scores"][0]
        else:
            log.warning(f"Unexpected HF response, skipping sentence: {result}")
            return "irrelevant", 0.0
        return best_label, best_score

    except Exception as error:
        log.warning(f"BERT classification failed for one sentence: {error}")
        return "irrelevant", 0.0


def find_important_sentences(text):
    sentences = split_into_sentences(text)
    log.info(f"Total sentences found: {len(sentences)}")

    if len(sentences) > MAX_SENTENCES_TO_CHECK:
        log.info(
            f"Capping at {MAX_SENTENCES_TO_CHECK} sentences "
            f"(policy had {len(sentences)})"
        )
        sentences = sentences[:MAX_SENTENCES_TO_CHECK]

    important_sentences = [] 
    found_categories    = {}  

    for sentence in sentences:
        category, confidence = classify_one_sentence(sentence)

        if category == "irrelevant":
            continue

        if confidence < 0.50:
            continue

        important_sentences.append(sentence)

        if category not in found_categories:
            found_categories[category] = []
        found_categories[category].append(sentence)

    log.info(f"Important sentences found: {len(important_sentences)} out of {len(sentences)}")
    return important_sentences, found_categories


# SECTION 5 — RISK SCORE CALCULATOR

def calculate_risk_score(found_categories):
    if not found_categories:
        return 1  
    total_weight = 0.0

    for category, sentences in found_categories.items():
        weight = RISK_CATEGORIES.get(category, 0.0)
        total_weight += weight
        if len(sentences) > 2:
            total_weight += weight * 0.2  # add 20% extra

    score = min(10, round(1 + (total_weight * 1.1)))
    return max(1, score)


def get_risk_label(score):
    for low, high, label in SCORE_LABELS:
        if low <= score <= high:
            return label
    return "CRITICAL"



# SECTION 6 — GROQ LLM (THE EXPLAINER)

SYSTEM_PROMPT = """You are a privacy expert who explains legal text 
in simple plain English that a teenager can understand.
You will receive important sentences already pulled from a privacy policy.
Explain what they mean for a normal everyday user.
Reply ONLY with valid JSON. No markdown. No explanation. Just the JSON."""


def ask_gpt_to_explain(important_sentences, found_categories):

    if not important_sentences:
        return {
            "summary": "This privacy policy looks fairly standard. No major red flags were found.",
            "flags": [],
            "categories": {
                "data_collection": [],
                "data_sharing"   : [],
                "user_rights"    : [],
                "security"       : []
            },
            "positive_points": ["No major privacy concerns detected"]
        }

    bullet_list    = "\n".join([f"- {s}" for s in important_sentences[:30]])
    category_names = list(found_categories.keys())

    user_message = f"""Here are the most important sentences from a privacy policy.
Risk categories detected by our AI: {', '.join(category_names)}

Key sentences:
{bullet_list}

Reply with ONLY this exact JSON structure — no extra text:
{{
  "summary": "2-3 sentences explaining what this means for a normal user in simple words",
  "flags": [
    "One short plain-English sentence per red flag found (max 8 items)"
  ],
  "categories": {{
    "data_collection": ["list what data they collect"],
    "data_sharing"   : ["list who they share it with"],
    "user_rights"    : ["list what the user can do: delete account, opt out, etc."],
    "security"       : ["list how they protect your data"]
  }},
  "positive_points": [
    "Any good/user-friendly parts of the policy — empty list if none"
  ]
}}

Important rules:
- Write like you are explaining to a 16 year old
- No legal words — use everyday language
- Each flag must be under 10 words
- Use empty list [] for any category with nothing to report"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",  
            temperature=0.1,   
            max_tokens=1000,   
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_message}
            ]
        )
    except Exception as error:
        raise RuntimeError(f"Groq API call failed: {error}")

    raw_reply   = response.choices[0].message.content.strip()
    clean_reply = re.sub(r"```(?:json)?|```", "", raw_reply).strip()

    try:
        parsed = json.loads(clean_reply)
    except json.JSONDecodeError as error:
        log.error(f"Groq returned bad JSON: {raw_reply}")
        raise RuntimeError(f"Could not parse Groq response: {error}")

    parsed.setdefault("summary", "")
    parsed.setdefault("flags", [])
    parsed.setdefault("categories", {})
    parsed.setdefault("positive_points", [])
    for key in ("data_collection", "data_sharing", "user_rights", "security"):
        parsed["categories"].setdefault(key, [])

    return parsed


# SECTION 7 — MAIN FUNCTION (called by app.py)

def analyze_policy(raw_text):
    if not raw_text or not raw_text.strip():
        raise ValueError("No policy text was provided")

    log.info("Step 1: Cleaning text...")
    text = clean_text(raw_text)
    log.info(f"Text length after cleaning: {len(text)} characters")

    log.info("Step 2: Running HuggingFace BERT to find risky sentences...")
    important_sentences, found_categories = find_important_sentences(text)

    log.info("Step 3: Running Groq to explain findings...")
    gpt_result = ask_gpt_to_explain(important_sentences, found_categories)

    score = calculate_risk_score(found_categories)
    level = get_risk_label(score)

    result = {
        "score"          : score,
        "level"          : level,
        "summary"        : gpt_result.get("summary", ""),
        "flags"          : gpt_result.get("flags", []),
        "categories"     : gpt_result.get("categories", {}),
        "positive_points": gpt_result.get("positive_points", []),
    }

    log.info(f"Analysis done! Score: {score}/10 ({level}) | "
             f"Flags: {len(result['flags'])} | "
             f"Key sentences: {len(important_sentences)}")

    return result
