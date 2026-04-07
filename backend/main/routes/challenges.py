import json
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from ...auth import auth
from ...auth.deps import get_current_user, require_csrf
from ...core import models
from ...core.config import CHALLENGE_FILE

router = APIRouter()


def _read_challenges_file() -> dict:
    with open(CHALLENGE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_challenges() -> dict:
    data = _read_challenges_file()
    if not isinstance(data, dict):
        raise json.JSONDecodeError("challenges.json must be an object", doc=str(data)[:200], pos=0)
    return data




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
        entries.append(
            {
                "label": item["label"],
                "url": f"/api/download/{problem_key}/{idx}",
                "size": size,
            }
        )
    return entries


@router.get("/api/challenges")
def list_challenges():
    try:
        challenges = load_challenges()
        if not isinstance(challenges, dict):
            raise json.JSONDecodeError("challenges.json must be an object", doc=str(challenges)[:200], pos=0)
        out = {}
        for key, challenge in challenges.items():
            ch = dict(challenge)
            ch.pop("dir", None)
            ch.pop("flag", None)
            ch.pop("flag_path", None)
            ch.pop("container_dir", None)
            ch["downloads"] = build_download_entries(key, challenge)
            out[key] = ch
        return out
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="challenges.json not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="challenges.json is invalid JSON")


@router.get("/api/download/{problem_key}/{file_index}")
def download(problem_key: str, file_index: int, request: Request):
    get_current_user(request)
    challenges = load_challenges()
    challenge = challenges.get(problem_key)
    if not challenge:
        raise HTTPException(status_code=404, detail="challenge not found")

    normalized = normalize_downloads(challenge)
    if file_index < 0 or file_index >= len(normalized):
        raise HTTPException(status_code=404, detail="file not found")

    base_dir = challenge.get("dir")
    if not base_dir:
        raise HTTPException(status_code=404, detail="challenge dir not found")

    item = normalized[file_index]
    abs_path = safe_join(base_dir, item["path"])
    if not abs_path or not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="file not found")

    return FileResponse(abs_path, filename=item["label"], media_type="application/octet-stream")


__all__ = [
    "router",
    "load_challenges",
    "safe_join",
]


def _resolve_flag(challenge: dict) -> str:
    if "flag" in challenge and challenge.get("flag") is not None:
        return str(challenge.get("flag")).strip()

    flag_path = challenge.get("flag_path")
    if not flag_path:
        raise HTTPException(status_code=400, detail="flag not configured for this challenge")

    base_dir = challenge.get("dir")
    if not base_dir:
        raise HTTPException(status_code=500, detail="challenge dir missing")

    if os.path.isabs(flag_path):
        base_abs = os.path.abspath(base_dir)
        target = os.path.abspath(flag_path)
        if os.path.commonpath([base_abs, target]) != base_abs:
            raise HTTPException(status_code=403, detail="flag path not allowed")
        flag_abs = target
    else:
        flag_abs = safe_join(base_dir, flag_path)

    if not flag_abs or not os.path.isfile(flag_abs):
        raise HTTPException(status_code=404, detail="flag file not found")

    with open(flag_abs, "r", encoding="utf-8", errors="ignore") as f:
        return f.read().strip()


@router.post("/submit")
@router.post("/api/submit")
def submit_flag(req: models.SubmitRequest, request: Request):
    user = get_current_user(request)
    require_csrf(request)

    try:
        challenges = load_challenges()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="challenges.json not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="challenges.json is invalid JSON")

    challenge = challenges.get(req.problem)
    if not isinstance(challenge, dict):
        raise HTTPException(status_code=404, detail="challenge not found")

    expected = _resolve_flag(challenge)
    submitted = (req.flag or "").strip()

    if not expected:
        raise HTTPException(status_code=400, detail="flag not configured for this challenge")

    if submitted != expected:
        return {"status": "ok", "correct": False}

    score = int(challenge.get("score") or 0)
    solved, user_info = auth.mark_problem_solved(user.get("username"), req.problem, score)
    return {
        "status": "ok",
        "correct": True,
        "already_solved": not solved,
        "score_awarded": 0 if not solved else score,
        "user": user_info,
    }
