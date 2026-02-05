import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
CHALLENGE_FILE = os.path.join(ROOT_DIR, "challenges.json")


def load_challenges() -> dict:
    with open(CHALLENGE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def normalize_downloads(challenge: dict) -> list[dict]:
    raw = challenge.get("downloads") or challenge.get("files") or []
    if not isinstance(raw, list):
        return []

    normalized = []
    for item in raw:
        if isinstance(item, str):
            rel_path = item
            label = os.path.basename(rel_path)
        elif isinstance(item, dict):
            rel_path = item.get("path") or item.get("file")
            label = item.get("label") or item.get("name")
            if not label and rel_path:
                label = os.path.basename(rel_path)
        else:
            continue

        if not rel_path:
            continue

        normalized.append({"path": rel_path, "label": label or os.path.basename(rel_path)})
    return normalized


def safe_join(base_dir: str, rel_path: str) -> str | None:
    base_abs = os.path.abspath(base_dir)
    target = os.path.abspath(os.path.join(base_abs, rel_path))
    if os.path.commonpath([base_abs, target]) != base_abs:
        return None
    return target


def build_download_entries(problem_key: str, challenge: dict) -> list[dict]:
    base_dir = challenge.get("dir")
    if not base_dir:
        return []

    entries = []
    normalized = normalize_downloads(challenge)
    for idx, item in enumerate(normalized):
        abs_path = safe_join(base_dir, item["path"])
        if not abs_path or not os.path.isfile(abs_path):
            continue
        size = os.path.getsize(abs_path)
        entries.append({
            "label": item["label"],
            "url": f"/api/download/{problem_key}/{idx}",
            "size": size
        })
    return entries
