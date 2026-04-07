from __future__ import annotations

from ..core.storage_utils import exclusive_lock
from .settings_store import (
    DEFAULT_USER_INSTANCE_LIMIT,
    MAX_USER_INSTANCE_LIMIT,
    load_settings_unlocked,
    save_settings_unlocked,
)
from ..core.config import SETTINGS_FILE

SETTINGS_LOCK_FILE = SETTINGS_FILE + ".lock"


def get_user_instance_limit(user: dict | None = None) -> int | None:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()

    default_limit = int(settings.get("user_instance_limit", DEFAULT_USER_INSTANCE_LIMIT))
    if user is None:
        return default_limit

    username = str(user.get("username") or "").strip()
    role = str(user.get("role") or "").strip()

    user_limits = settings.get("user_instance_limits")
    if isinstance(user_limits, dict) and username in user_limits:
        user_limit = user_limits.get(username)
        if user_limit is None:
            return None
        return int(user_limit)

    role_limits = settings.get("role_instance_limits")
    if isinstance(role_limits, dict) and role in role_limits:
        role_limit = role_limits.get(role)
        if role_limit is None:
            return None
        return int(role_limit)

    if role == "admin":
        return None

    return default_limit


def set_user_instance_limit(limit: int) -> int:
    limit_int = int(limit)
    if limit_int < 0:
        raise ValueError("limit must be >= 0")
    if limit_int > MAX_USER_INSTANCE_LIMIT:
        raise ValueError(f"limit must be <= {MAX_USER_INSTANCE_LIMIT}")

    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()
        settings["user_instance_limit"] = limit_int
        save_settings_unlocked(settings)
        return limit_int


__all__ = ["get_user_instance_limit", "set_user_instance_limit", "SETTINGS_LOCK_FILE"]
