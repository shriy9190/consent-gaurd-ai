"""
ConsentGuard-AI - Step 5: Clause Classification Engine
Uses OpenAI API for classification + HuggingFace for lightweight summarization.
Exposes classify_clause(text) -> dict, matching the shape app.py expects.
"""

import os
import json
from openai import OpenAI

# ---------------------------------------------------------
# Setup
# ---------------------------------------------------------
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

CATEGORIES = [
    "data_collection_scope",
    "retention_duration",
    "third_party_sharing",
    "data_resale",
    "opt_out_availability",
    "jurisdiction_legal_recourse",
    "device_permissions",
    "location_tracking",
]

SEVERITY_LEVELS = ["low", "medium", "high", "ambiguous"]

SYSTEM_PROMPT = f"""You are a privacy policy risk classifier. Given a single clause
from a privacy policy, analyze it and return ONLY valid JSON (no other text, no markdown).

Categories (choose the single most relevant one): {", ".join(CATEGORIES)}

Severity rubric:
- HIGH: indefinite retention, data sold/shared with unnamed third parties, no opt-out,
  broad device/location access with no limit
- MEDIUM: shared with named partners only, retention period stated but long (1+ year),
  opt-out exists but is buried/complex
- LOW: short retention (under 90 days), no third-party sharing, clear and easy opt-out,
  narrow/limited data collection
- AMBIGUOUS: clause is too vague to confidently classify

Return JSON in exactly this shape:
{{
  "clause": "<original clause text, max 150 chars>",
  "category": "<one of the categories above>",
  "severity": "low" | "medium" | "high" | "ambiguous",
  "confidence": <float 0-1>,
  "plain_explanation": "<one sentence, plain English, no legal jargon>"
}}"""


# ---------------------------------------------------------
# Main function - this is what app.py imports
# ---------------------------------------------------------
def classify_clause(clause: str) -> dict:
    """
    Classify a single privacy policy clause.
    Returns dict matching the shape app.py's classify_all_chunks() expects.
    Falls back to a safe default if the API call fails or returns bad JSON.
    """
    fallback = {
        "clause": clause[:150],
        "category": "data_collection_scope",
        "severity": "ambiguous",
        "confidence": 0.3,
        "plain_explanation": "Could not confidently classify this clause."
    }

    if not clause or len(clause.strip()) < 10:
        return fallback

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # fast + cheap, good enough for clause-level classification
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f'Clause: "{clause}"'}
            ],
            temperature=0.2,  # low temp - we want consistent classification, not creativity
            response_format={"type": "json_object"},
        )

        raw_output = response.choices[0].message.content
        parsed = json.loads(raw_output)

        # Validate output shape before trusting it
        if parsed.get("category") not in CATEGORIES:
            parsed["category"] = "data_collection_scope"
        if parsed.get("severity") not in SEVERITY_LEVELS:
            parsed["severity"] = "ambiguous"
        if not isinstance(parsed.get("confidence"), (int, float)):
            parsed["confidence"] = 0.5
        parsed["confidence"] = max(0.0, min(1.0, float(parsed["confidence"])))
        parsed["clause"] = parsed.get("clause", clause)[:150]
        parsed["plain_explanation"] = parsed.get("plain_explanation", "No explanation provided.")

        return parsed

    except Exception as e:
        print(f"Classification error (non-critical, using fallback): {e}")
        return fallback


# ---------------------------------------------------------
# Batch helper (optional convenience - app.py can use this directly
# instead of looping classify_clause itself)
# ---------------------------------------------------------
def classify_all_chunks(chunks: list) -> list:
    return [classify_clause(chunk) for chunk in chunks]


# ---------------------------------------------------------
# Quick manual test
# ---------------------------------------------------------
if __name__ == "__main__":
    test_clauses = [
        "We may share your location data with advertising partners and affiliated third parties indefinitely.",
        "You can delete your account and all associated data within 30 days of your request.",
        "We use industry-standard practices to handle your information appropriately."
    ]

    for c in test_clauses:
        result = classify_clause(c)
        print(json.dumps(result, indent=2))
        print("-" * 50)
