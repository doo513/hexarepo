import json

from fastapi import APIRouter, HTTPException, Request

from . import auth
from .deps import get_admin_user
from .deps import require_csrf
from ..core import models
from ..core.config import CHALLENGE_FILE
from ..main.instance_store import ACTIVE_INSTANCE_STATUSES, list_instances_snapshot
from ..main.settings_service import get_ranking_settings, get_user_instance_limit, set_ranking_open, set_user_instance_limit, get_challenges_settings, set_challenges_visibility, set_ranking_schedule, is_challenges_visible, is_ranking_visible

router = APIRouter()


@router.get("/api/admin/users")
def list_users(request: Request):
    get_admin_user(request)
    counts: dict[str, int] = {}
    for inst in list_instances_snapshot():
        if not isinstance(inst, dict):
            continue
        if inst.get("status") not in ACTIVE_INSTANCE_STATUSES:
            continue
        owner = str(inst.get("owner") or "").strip().lower()
        if not owner:
            continue
        counts[owner] = counts.get(owner, 0) + 1

    users = []
    for user in auth.list_public_users(include_pending=True):
        username = str(user.get("username") or "").strip().lower()
        active_count = counts.get(username, 0)
        user_row = dict(user)
        user_row["active_instances"] = active_count
        user_row["active_instance_count"] = active_count
        users.append(user_row)

    return {
        "status": "ok",
        "users": users
    }


@router.post("/api/admin/users/{username}/role")
def update_user_role(username: str, req: models.RoleUpdateRequest, request: Request):
    get_admin_user(request)
    require_csrf(request)
    try:
        user = auth.update_role(username, req.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "status": "ok",
        "user": auth.public_user(user)
    }


@router.post("/api/admin/users/{username}/password")
def reset_user_password(username: str, req: models.PasswordResetRequest, request: Request):
    get_admin_user(request)
    require_csrf(request)
    try:
        user = auth.reset_password(username, req.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "status": "ok",
        "user": auth.public_user(user)
    }


@router.delete("/api/admin/users/{username}")
def delete_user(username: str, request: Request):
    get_admin_user(request)
    require_csrf(request)
    try:
        auth.delete_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "status": "ok",
        "username": username
    }


@router.post("/api/admin/users/{username}/approve")
def approve_pending_user(username: str, request: Request):
    get_admin_user(request)
    require_csrf(request)
    try:
        user = auth.approve_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok", "user": auth.public_user(user)}


@router.delete("/api/admin/users/{username}/reject")
def reject_pending_user(username: str, request: Request):
    get_admin_user(request)
    require_csrf(request)
    try:
        auth.reject_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok", "username": username}


@router.post("/api/admin/scoreboard/reset")
def reset_scoreboard(request: Request):
    get_admin_user(request)
    require_csrf(request)
    updated = auth.reset_scoreboard()
    return {
        "status": "ok",
        "updated": updated
    }


@router.get("/api/admin/settings")
def get_settings(request: Request):
    get_admin_user(request)
    ranking = get_ranking_settings()
    # Load schedule fields not in ranking dict
    from ..main.settings_service import SETTINGS_LOCK_FILE
    from ..core.storage_utils import exclusive_lock
    from ..main.settings_store import load_settings_unlocked
    with exclusive_lock(SETTINGS_LOCK_FILE):
        raw = load_settings_unlocked()
    ranking["ranking_open_at"] = raw.get("ranking_open_at")
    ranking["ranking_close_at"] = raw.get("ranking_close_at")
    challenges = get_challenges_settings()
    return {
        "status": "ok",
        "settings": {
            "user_instance_limit": get_user_instance_limit(),
            "ranking_open": ranking["ranking_open"],
            "ranking_closed_message": ranking["ranking_closed_message"],
            "ranking_open_at": ranking.get("ranking_open_at"),
            "ranking_close_at": ranking.get("ranking_close_at"),
            "challenges_open": challenges["challenges_open"],
            "challenges_open_at": challenges.get("challenges_open_at"),
            "challenges_close_at": challenges.get("challenges_close_at"),
            "challenges_closed_message": challenges.get("challenges_closed_message"),
        },
    }


@router.post("/api/admin/settings")
def update_settings(req: models.SettingsUpdateRequest, request: Request):
    get_admin_user(request)
    require_csrf(request)
    try:
        limit = get_user_instance_limit()
        if req.user_instance_limit is not None:
            limit = set_user_instance_limit(req.user_instance_limit)

        ranking = get_ranking_settings()
        if req.ranking_open is not None or req.ranking_closed_message is not None:
            ranking = set_ranking_open(
                ranking_open=ranking["ranking_open"] if req.ranking_open is None else req.ranking_open,
                ranking_closed_message=req.ranking_closed_message,
            )

        # Ranking schedule
        if req.ranking_open_at is not None or req.ranking_close_at is not None:
            ranking_sched = set_ranking_schedule(
                ranking_open_at=req.ranking_open_at if req.ranking_open_at is not None else ...,
                ranking_close_at=req.ranking_close_at if req.ranking_close_at is not None else ...,
            )

        # Challenge visibility
        challenges = get_challenges_settings()
        if (req.challenges_open is not None or req.challenges_open_at is not None
                or req.challenges_close_at is not None or req.challenges_closed_message is not None):
            challenges = set_challenges_visibility(
                challenges_open=req.challenges_open,
                challenges_open_at=req.challenges_open_at if req.challenges_open_at is not None else ...,
                challenges_close_at=req.challenges_close_at if req.challenges_close_at is not None else ...,
                challenges_closed_message=req.challenges_closed_message if req.challenges_closed_message is not None else None,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Reload full settings for response
    challenges = get_challenges_settings()
    ranking = get_ranking_settings()
    from ..main.settings_service import SETTINGS_LOCK_FILE
    from ..core.storage_utils import exclusive_lock
    from ..main.settings_store import load_settings_unlocked
    with exclusive_lock(SETTINGS_LOCK_FILE):
        raw = load_settings_unlocked()

    return {
        "status": "ok",
        "settings": {
            "user_instance_limit": limit,
            "ranking_open": ranking["ranking_open"],
            "ranking_closed_message": ranking["ranking_closed_message"],
            "ranking_open_at": raw.get("ranking_open_at"),
            "ranking_close_at": raw.get("ranking_close_at"),
            "challenges_open": challenges["challenges_open"],
            "challenges_open_at": challenges.get("challenges_open_at"),
            "challenges_close_at": challenges.get("challenges_close_at"),
            "challenges_closed_message": challenges.get("challenges_closed_message"),
        },
    }


@router.get("/api/admin/users/{username}")
def user_detail(username: str, request: Request):
    get_admin_user(request)
    user = auth.get_user(username)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")

    public = auth.public_user(user)
    rows = auth.get_scoreboard(limit=100000, include_admin=True)
    rank = None
    for row in rows:
        row_username = str(row.get("username") or "").strip().lower()
        if row_username == str(public.get("username") or "").strip().lower():
            rank = row.get("rank")
            break

    return {
        "status": "ok",
        "user": public,
        "rank": rank,
    }


@router.get("/api/admin/summary")
def admin_summary(request: Request):
    get_admin_user(request)
    users = auth.list_public_users(include_pending=True)
    instances = list_instances_snapshot()
    active_sessions = auth.count_recent_active_users(within_seconds=60, include_admin=True)
    ranking = get_ranking_settings()
    challenges_vis, _ = is_challenges_visible()
    rankings_vis, _ = is_ranking_visible()
    challenge_count = 0
    try:
        with open(CHALLENGE_FILE, "r", encoding="utf-8") as f:
            challenge_data = json.load(f)
        if isinstance(challenge_data, dict):
            challenge_count = len(challenge_data)
    except (FileNotFoundError, json.JSONDecodeError):
        challenge_count = 0

    return {
        "status": "ok",
        "summary": {
            "total_users": len(users),
            "admin_users": sum(1 for u in users if u.get("role") == "admin"),
            "active_sessions": active_sessions,
            "active_instances": sum(
                1
                for inst in instances
                if isinstance(inst, dict) and inst.get("status") in ACTIVE_INSTANCE_STATUSES
            ),
            "total_score": sum(int(u.get("score") or 0) for u in users),
            "total_solves": sum(len(u.get("solved_problems") or []) for u in users),
            "challenge_count": challenge_count,
            "user_instance_limit": get_user_instance_limit(),
            "ranking_open": ranking["ranking_open"],
            "ranking_closed_message": ranking["ranking_closed_message"],
            "challenges_visible": challenges_vis,
            "ranking_visible": rankings_vis,
        },
    }
