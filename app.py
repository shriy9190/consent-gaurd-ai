
import os
import logging

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv


load_dotenv()

import ai_helper
import cache


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)
# SECTION 1 — FLASK APP SETUP


app = Flask(__name__)


app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2 MB


CORS(app)

APP_API_KEY = os.getenv("APP_API_KEY")



# SECTION 2 — HELPER FUNCTIONS

def is_authorized(req):
    # If APP_API_KEY isn't set, skip the check (useful for local
    # dev so you don't have to configure it immediately).
    if not APP_API_KEY:
        return True
    return req.headers.get("X-API-Key") == APP_API_KEY



# SECTION 3 — ROUTES


@app.route("/api/health", methods=["GET"])
def health_check():
   
    return jsonify({"status": "ok"}), 200


@app.route("/api/analyze", methods=["POST"])
def analyze():
   


    # ── Step 0: Check the API key ─────────────────────────
    if not is_authorized(request):
        return jsonify({"error": "Unauthorized"}), 401

    # ── Step 1: Parse and validate the request body ──────
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

        
    url = (data.get("url") or "").strip()
    raw_text = data.get("text") or ""

    if not url:
        return jsonify({"error": "Missing 'url' field"}), 400
    if not raw_text.strip():
        return jsonify({"error": "Missing 'text' field"}), 400

    
    MAX_TEXT_LENGTH = 300_000
    if len(raw_text) > MAX_TEXT_LENGTH:
        raw_text = raw_text[:MAX_TEXT_LENGTH]
        log.info(f"Truncated oversized text for {url} to {MAX_TEXT_LENGTH} chars")

    log.info(f"Analyze request for: {url}")

    # ── Step 2: Check the cache first ─────────────────────
    
    cached_result = cache.get_cached_result(url)
    if cached_result:
        log.info(f"Cache hit — skipping AI for {url}")
        return jsonify({**cached_result, "cached": True}), 200

    # ── Step 3: Cache miss — run the real AI pipeline ─────
    log.info(f"Cache miss — running AI pipeline for {url}")
    try:
        result = ai_helper.analyze_policy(raw_text)
    except ValueError as error:
        # Bad input (e.g. empty text after cleaning)
        return jsonify({"error": str(error)}), 400
    except RuntimeError as error:
        # An API call (Groq/HuggingFace) failed
        log.error(f"AI pipeline failed for {url}: {error}")
        return jsonify({"error": "Analysis failed. Please try again."}), 502
    except Exception as error:
        # Anything else unexpected
        log.error(f"Unexpected error analyzing {url}: {error}")
        return jsonify({"error": "Something went wrong."}), 500

    # ── Step 4: Save to cache for next time ───────────────
    cleaned_text = ai_helper.clean_text(raw_text)
    cache.save_result(url, cleaned_text, result)

    # ── Step 5: Return the result ─────────────────────────
    return jsonify({**result, "cached": False}), 200


@app.route("/api/cache/stats", methods=["GET"])
def cache_stats():
    
    if not is_authorized(request):
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(cache.get_cache_stats()), 200


@app.route("/api/cache/clear", methods=["POST"])
def cache_clear():
    
    if not is_authorized(request):
        return jsonify({"error": "Unauthorized"}), 401
    cleared = cache.clear_cache()
    return jsonify({"cleared": cleared}), 200
@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(413)
def payload_too_large(error):
    return jsonify({"error": "Request body too large"}) , 413

if __name__ == "__main__":
    
    port = int(os.getenv("PORT", 5000))
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
