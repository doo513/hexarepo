from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
import json
import os

from .challenge_store import build_download_entries, load_challenges, normalize_downloads, safe_join
from .deps import get_current_user

router = APIRouter()


@router.get("/api/challenges")
def list_challenges():
    try:
        challenges = load_challenges()
        out = {}
        for key, challenge in challenges.items():
            ch = dict(challenge)
            ch.pop("dir", None)
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
