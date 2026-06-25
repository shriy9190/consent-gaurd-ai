from chromadb.config import Setting
import chromadb
import json
import hashlib
import os
from datetime import datetime

DBpath = os.getenv("chroma_db_path", "./.chroma_db")
_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is not None:
        return _collection

    os.makedirs(DBpath, exist_ok=True)
    _client = chromadb.PersistentClient(path=DBpath, settings=settings(anonymized_telemetry=False))
    _collection = _client.get_or_create_collection("policy_cache")
    print(f"chromadb connected-saving data at:{DBpath}")
    return _collection


# url helper system

def _normalize_url(url):
    url = url.lower().strip()
    url = url.replace("https://", "").replace("http://", "")
    url = url.split("?")[0]
    url = url.split("#")[0]
    url = url.rstrip("/")
    url = url.replace("www.", "")
    return url


def url_to_id(url):
    cleaned_url = _normalize_url(url)
    return hashlib.sha256(cleaned_url.encode()).hexdigest()[:32]


# main functions

def check_cache(url):
    try:
        collection = _get_collection()
        doc_id = url_to_id(url)
        result = collection.get(ids=[doc_id], include=["metadatas", "documents"])
        if not result["ids"]:
            print(f"cache miss:{_normalize_url(url)}")
            return None
        saved_data = json.loads(result["documents"][0])
        print(f"cache hit:{_normalize_url(url)}")
        return saved_data
    except Exception as error:
        print(f" cache check error(non-critical): {error}")
        return None


def save_cache(url, analysis):
    try:
        collection = _get_collection()
        doc_id = url_to_id(url)
        cleaned_url = _normalize_url(url)
        doc_json = json.dumps(analysis)
        metadata = {
            "url": cleaned_url,
            "score": analysis.get("score", 0),
            "level": analysis.get("level", "UNKNOWN"),
            "flag_count":len(analysis.get("flags", [])),
            "saved_at": datetime.utcnow().isoformat(),
        }
        collection.upsert(ids=[doc_id], documents=[doc_json], metadatas=[metadata])
        print(f"saved to cache :{cleaned_url}(score={metadata['score']})")
        return True
    except Exception as error:
        print(f"Failed to save to cache(non-critical): {error}")
        return False

def clear_cache():
    try:
        collection =_get_collection()
        all_ids =collection.get(include=[])["ids"]
        if not all_ids:
            print("Cache is already empty.")
            return 0
        collection.delete(ids=all_ids)
        print(f"Cleared {len(all_ids)} entries from the cache.")
        return len(all_ids)
    except Exception as error:
        print(f"Failed to clear cache(non-critical): {error}")
        return 0

def get_cache_stats():
    try:
        collection = _get_collection()
        all_data = collection.get(include=["metadatas"])
        total_entries = len(all_data["ids"])
        metadatas = all_data.get("metadatas", [])
        high_risk_count =sum(1 for m in metadatas if m.get("score", 0) >= 7)
        medium_risk_count = sum(1 for m in metadatas if 4 <= m.get("score", 0) < 7)
        low_risk_count = sum(1 for m in metadatas if 1 <= m.get("score", 0) < 4)
        return {
            "total_entries": total_entries,
            "high_risk_count": high_risk_count,
            "medium_risk_count": medium_risk_count,
            "low_risk_count": low_risk_count
        }
    except Exception as error:
        print(f"Failed to get cache stats(non-critical): {error}")
        return {
            "total_entries": 0,
            "high_risk_count": 0,
            "medium_risk_count": 0,
            "low_risk_count": 0
        }