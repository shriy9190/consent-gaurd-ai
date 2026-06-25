"""
ConsentGuard-AI Backend
Steps 1-10: Flask API, scraping, chunking, scoring, ChromaDB caching (via cache_handler.py), history
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import re

# Her ChromaDB caching module (Step 7 + 8 - already built)
from cache_handler import check_cache, save_cache, clear_cache, get_cache_stats

# ---------------------------------------------------------
# STEP 1: Flask app setup
# ---------------------------------------------------------
app = Flask(__name__)
CORS(app)


# ---------------------------------------------------------
# STEP 3: Scraping / cleaning policy text from a URL
# ---------------------------------------------------------
def scrape_policy_text(url: str) -> str:
    """Fetch and clean privacy policy text from a URL."""
    headers = {"User-Agent": "Mozilla/5.0 (ConsentGuard-AI Bot)"}
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------
# STEP 4: Chunking text into clause-sized pieces
# ---------------------------------------------------------
def chunk_text(text: str, min_len: int = 40) -> list:
    raw_sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = [s.strip() for s in raw_sentences if len(s.strip()) >= min_len]
    return chunks


# ---------------------------------------------------------
# STEP 5: AI/ML classification (built by teammate - import her real function here)
# Replace this stub with: from ml_model import classify_clause
# ---------------------------------------------------------
def classify_clause(clause: str) -> dict:
    """
    STUB - replace with teammate's actual function.
    """
    return {
        "clause": clause[:150],
        "category": "data_collection_scope",
        "severity": "medium",
        "confidence": 0.75,
        "plain_explanation": "Placeholder explanation - swap in real model output."
    }


def classify_all_chunks(chunks: list) -> list:
    return [classify_clause(chunk) for chunk in chunks]


# ---------------------------------------------------------
# STEP 6: Exposure Score formula
# NOTE: matching her scale here - score out of 10, not 0-100,
# since her cache_handler buckets risk as >=7 high, 4-6 medium, 1-3 low
# ---------------------------------------------------------
SEVERITY_WEIGHTS = {"low": 1, "medium": 3, "high": 6, "ambiguous": 2}


def calculate_exposure_score(classified_clauses: list) -> float:
    """Returns a score on a 0-10 scale to match cache_handler's bucket thresholds."""
    if not classified_clauses:
        return 0.0

    total_weight = sum(
        SEVERITY_WEIGHTS.get(c["severity"], 2) * c.get("confidence", 0.5)
        for c in classified_clauses
    )
    max_possible = len(classified_clauses) * SEVERITY_WEIGHTS["high"]
    raw_score = (total_weight / max_possible) * 10  # scaled to 0-10
    return round(min(raw_score, 10), 1)


def get_risk_level(score: float) -> str:
    if score >= 7:
        return "HIGH"
    elif score >= 4:
        return "MEDIUM"
    elif score >= 1:
        return "LOW"
    return "MINIMAL"


def get_flags(classified_clauses: list, n: int = 3) -> list:
    """Top n highest-risk clauses, used as 'flags' to match her metadata shape."""
    sorted_clauses = sorted(
        classified_clauses,
        key=lambda c: SEVERITY_WEIGHTS.get(c["severity"], 2) * c.get("confidence", 0.5),
        reverse=True
    )
    return sorted_clauses[:n]


# ---------------------------------------------------------
# STEP 2 + 9: Main /analyze route
# ---------------------------------------------------------
@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json(silent=True) or {}
    text_input = data.get('text')
    url_input = data.get('url')

    if not text_input and not url_input:
        return jsonify({"error": "No text or URL provided"}), 400

    # Step 8: check cache first (only works for URL input, since cache is keyed by URL)
    if url_input:
        cached = check_cache(url_input)
        if cached:
            cached["cached"] = True
            return jsonify(cached)

    # Step 3: scrape if URL given
    try:
        policy_text = scrape_policy_text(url_input) if url_input else text_input
    except Exception as e:
        return jsonify({"error": f"Failed to fetch policy: {str(e)}"}), 500

    if not policy_text or len(policy_text) < 20:
        return jsonify({"error": "Policy text too short or empty"}), 400

    # Step 4: chunk
    chunks = chunk_text(policy_text)
    if not chunks:
        return jsonify({"error": "Could not extract clauses from policy"}), 400

    # Step 5: classify (teammate's function)
    classified = classify_all_chunks(chunks)

    # Step 6: score (matches her 0-10 scale + "flags" naming)
    score = calculate_exposure_score(classified)
    level = get_risk_level(score)
    flags = get_flags(classified)

    result = {
        "score": score,
        "level": level,
        "flags": flags,
        "full_breakdown": classified,
        "cached": False
    }

    # Step 7: save to cache (only if URL was given - her cache is URL-keyed)
    if url_input:
        save_cache(url_input, result)

    return jsonify(result)


# ---------------------------------------------------------
# STEP 10: History / stats route
# NOTE: her cache has no per-user tracking (URL-keyed only),
# so this returns global cache stats, not a specific user's history
# ---------------------------------------------------------
@app.route('/history', methods=['GET'])
def history():
    stats = get_cache_stats()
    return jsonify({"cache_stats": stats})


@app.route('/cache/clear', methods=['POST'])
def cache_clear():
    cleared = clear_cache()
    return jsonify({"cleared_entries": cleared})


# ---------------------------------------------------------
# Health check
# ---------------------------------------------------------
@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
