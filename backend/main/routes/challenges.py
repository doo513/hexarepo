import json
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from ...core import models
from ...core.config import CHALLENGE_FILE
from ..dynamic_flags import derive_dynamic_flag, dynamic_flag_enabled


def safe_join(base_dir: str, rel_path: str) -> str | None:
    base_abs = os.path.abspath(base_dir)
    target = os.path.abspath(os.path.join(base_abs, rel_path))
    if os.path.commonpath([base_abs, target]) != base_abs:
        return None
    return target


router = APIRouter()


from ...auth import auth
from ...auth.deps import get_current_user, require_csrf


def _stop_owned_instance_after_solve(*, user: dict, problem_key: str) -> dict:
    from ..instances_service import InstancesError, list_instances, stop_instance

    try:
        owned_instances = list_instances(user=user)
    except InstancesError as exc:
        return {"attempted": False, "stopped": False, "detail": exc.detail}

    match = next(
        (
            instance
            for instance in owned_instances
            if instance.get("problem") == problem_key and instance.get("status") == "running"
        ),
        None,
    )
    if not match:
        return {"attempted": False, "stopped": False, "detail": "no_running_instance"}

    instance_id = int(match.get("instance_id") or 0)
    if instance_id <= 0:
        return {"attempted": False, "stopped": False, "detail": "invalid_instance_id"}

    try:
        result = stop_instance(user=user, instance_id=instance_id)
    except InstancesError as exc:
        return {
            "attempted": True,
            "stopped": False,
            "instance_id": instance_id,
            "detail": exc.detail,
        }

    return {
        "attempted": True,
        "stopped": result.get("detail") not in {"already_stopping", "not_running"},
        "instance_id": instance_id,
        "detail": result.get("detail") or "stopped",
    }


def _read_challenges_file() -> dict:
    with open(CHALLENGE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_challenges() -> dict:
    data = _read_challenges_file()
    if not isinstance(data, dict):
        raise json.JSONDecodeError("challenges.json must be an object", doc=str(data)[:200], pos=0)
    return data


def _normalize_key(value: str) -> str:
    return "".join(ch for ch in str(value or "").strip().lower() if ch.isalnum())


def _resolve_challenge_key(challenges: dict, raw_key: str) -> str | None:
    if raw_key in challenges:
        return raw_key

    needle = _normalize_key(raw_key)
    if not needle:
        return None

    for key, challenge in challenges.items():
        if _normalize_key(key) == needle:
            return key
        if not isinstance(challenge, dict):
            continue
        challenge_id = challenge.get("challenge_id")
        title = challenge.get("title")
        if challenge_id and _normalize_key(challenge_id) == needle:
            return key
        if title and _normalize_key(title) == needle:
            return key
    return None


def normalize_access_mode(challenge: dict) -> str:
    raw = str(challenge.get("access_mode") or challenge.get("network") or "").strip().lower()
    aliases = {
        "http": "http",
        "https": "http",
        "web": "http",
        "tcp": "tcp",
        "raw": "tcp",
        "nc": "tcp",
    }
    if raw in aliases:
        return aliases[raw]

    category = str(challenge.get("type") or challenge.get("category") or "").strip().lower()
    if category in {"pwn", "crypto"}:
        return "tcp"
    return "http"


def derive_difficulty(challenge: dict) -> str:
    raw = str(challenge.get("difficulty") or "").strip()
    if raw:
        return raw
    score = int(challenge.get("score") or 0)
    if score >= 700:
        return "Advanced"
    if score >= 400:
        return "Intermediate"
    return "Beginner"




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

        basename = os.path.basename(str(rel_path)).strip().lower()
        if basename == ".gitkeep":
            continue

        normalized.append({"path": rel_path, "label": label or os.path.basename(rel_path)})
    return normalized


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


def _strip_leading_markdown_title(text: str) -> str:
    lines = str(text or "").splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and lines[0].lstrip().startswith("#"):
        if lines[0].lstrip().startswith("# "):
            lines.pop(0)
            while lines and not lines[0].strip():
                lines.pop(0)
            break
        elif lines[0].lstrip().startswith("## "):
            lines.pop(0)
            while lines and not lines[0].strip():
                lines.pop(0)
            break
        else:
            break
    return "\n".join(lines).strip()


def _load_description_markdown(challenge: dict) -> str:
    base_dir = challenge.get("dir")
    if not base_dir:
        return ""

    description_path = safe_join(str(base_dir), "Description.md")
    if not description_path or not os.path.isfile(description_path):
        return ""

    try:
        with open(description_path, "r", encoding="utf-8") as f:
            return _strip_leading_markdown_title(f.read())
    except OSError:
        return ""


def sanitize_challenge(problem_key: str, challenge: dict, solve_count: int = 0) -> dict:
    ch = dict(challenge)
    ch.pop("dir", None)
    ch.pop("flag", None)
    ch.pop("flag_path", None)
    ch.pop("flag_mode", None)
    ch.pop("dynamic_flag", None)
    ch.pop("flag_prefix", None)
    ch.pop("flag_token_hex_len", None)
    ch.pop("flag_include_problem", None)
    ch.pop("flag_salt", None)
    ch.pop("container_flag_path", None)
    ch.pop("flag_mount_path", None)
    ch.pop("flag_env", None)
    ch.pop("container_dir", None)
    ch["key"] = problem_key
    ch["challenge_id"] = ch.get("challenge_id") or problem_key
    ch["access_mode"] = normalize_access_mode(challenge)
    ch["downloads"] = build_download_entries(problem_key, challenge)
    ch["solve_count"] = int(solve_count)
    ch["solves"] = int(solve_count)
    ch["difficulty"] = derive_difficulty(challenge)
    ch["author"] = (
        challenge.get("author")
        or challenge.get("created_by")
        or challenge.get("owner")
        or "arch_atelier"
    )
    if "description" in ch and "desc" not in ch:
        ch["desc"] = ch.get("description")
    if "desc" in ch and "description" not in ch:
        ch["description"] = ch.get("desc")
    desc = ch.get("desc") or ch.get("description") or _load_description_markdown(challenge) or ""
    if not desc:
        desc = "Challenge briefing unavailable."
    desc = _strip_leading_markdown_title(desc)
    ch["desc"] = desc
    ch["description"] = _strip_leading_markdown_title(ch.get("description") or desc)
    ch["briefing"] = (
        challenge.get("briefing")
        or challenge.get("mission")
        or desc
    )
    ch["briefing"] = _strip_leading_markdown_title(ch["briefing"])
    if "tags" not in ch:
        ch["tags"] = []
    ch["instance_note"] = challenge.get("instance_note") or "Provisioning may take up to 30 seconds."
    ch["service_path"] = challenge.get("service_path") or challenge.get("endpoint") or "/"
    return ch


@router.get("/api/challenges")
def list_challenges():
    try:
        challenges = load_challenges()
        if not isinstance(challenges, dict):
            raise json.JSONDecodeError("challenges.json must be an object", doc=str(challenges)[:200], pos=0)
        solve_counts = auth.get_problem_solve_counts()
        out = {}
        for key, challenge in challenges.items():
            out[key] = sanitize_challenge(key, challenge, solve_counts.get(key, 0))
        return out
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="challenges.json not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="challenges.json is invalid JSON")


@router.get("/api/challenges/{problem_key}")
def challenge_detail(problem_key: str):
    try:
        challenges = load_challenges()
        solve_counts = auth.get_problem_solve_counts()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="challenges.json not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="challenges.json is invalid JSON")

    resolved_key = _resolve_challenge_key(challenges, problem_key)
    if not resolved_key:
        raise HTTPException(status_code=404, detail="challenge not found")

    challenge = challenges.get(resolved_key)
    if not isinstance(challenge, dict):
        raise HTTPException(status_code=404, detail="challenge not found")

    return {
        "status": "ok",
        "challenge": sanitize_challenge(resolved_key, challenge, solve_counts.get(resolved_key, 0)),
    }


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
    "normalize_access_mode",
    "safe_join",
]


def _resolve_flag(challenge: dict, *, problem_key: str | None = None, username: str | None = None) -> str:
    if dynamic_flag_enabled(challenge):
        if not problem_key or not username:
            raise HTTPException(status_code=400, detail="dynamic flag context missing")
        return derive_dynamic_flag(
            challenge=challenge,
            problem_key=problem_key,
            username=username,
        )

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

    username = str(user.get("username") or "").strip()
    if not username:
        raise HTTPException(status_code=401, detail="Unauthorized")

    expected = _resolve_flag(challenge, problem_key=req.problem, username=username)
    submitted = (req.flag or "").strip()

    if not expected:
        raise HTTPException(status_code=400, detail="flag not configured for this challenge")

    if submitted != expected:
        return {"status": "ok", "correct": False}

    score = int(challenge.get("score") or 0)
    solved, user_info = auth.mark_problem_solved(username, req.problem, score)
    instance_stop = None
    if solved:
        instance_stop = _stop_owned_instance_after_solve(user=user, problem_key=req.problem)
    return {
        "status": "ok",
        "correct": True,
        "already_solved": not solved,
        "score_awarded": 0 if not solved else score,
        "user": user_info,
        "instance_stop": instance_stop,
    }
