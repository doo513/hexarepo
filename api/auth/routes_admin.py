from fastapi import APIRouter, HTTPException, Request

from . import auth
from .deps import get_admin_user
from .deps import require_csrf
from .. import models
from ..settings_store import get_user_instance_limit, set_user_instance_limit

router = APIRouter()


@router.get("/api/admin/users")
def list_users(request: Request):
    get_admin_user(request)
    return {
        "status": "ok",
        "users": auth.list_public_users()
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
    return {
        "status": "ok",
        "settings": {
            "user_instance_limit": get_user_instance_limit(),
        },
    }


@router.post("/api/admin/settings")
def update_settings(req: models.SettingsUpdateRequest, request: Request):
    get_admin_user(request)
    require_csrf(request)
    try:
        limit = set_user_instance_limit(req.user_instance_limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "ok",
        "settings": {
            "user_instance_limit": limit,
        },
    }
