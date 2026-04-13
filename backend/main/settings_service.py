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


def get_ranking_settings() -> dict:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()
    return {
        "ranking_open": bool(settings.get("ranking_open", True)),
        "ranking_closed_message": str(settings.get("ranking_closed_message") or "This page has been closed."),
    }


def set_ranking_open(*, ranking_open: bool, ranking_closed_message: str | None = None) -> dict:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()
        settings["ranking_open"] = bool(ranking_open)
        if ranking_closed_message is not None:
            message = str(ranking_closed_message).strip()
            if message:
                settings["ranking_closed_message"] = message
        save_settings_unlocked(settings)
        return {
            "ranking_open": bool(settings.get("ranking_open", True)),
            "ranking_closed_message": str(settings.get("ranking_closed_message") or "This page has been closed."),
        }





def _parse_iso_optional(value: object) -> "datetime | None":
    """Parse an optional ISO 8601 datetime string. Returns None for empty/null."""
    from datetime import datetime
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _iso_or_none(value: object) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    # validate it parses
    _parse_iso_optional(raw)
    return raw


def get_challenges_settings() -> dict:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()
    return {
        "challenges_open": bool(settings.get("challenges_open", True)),
        "challenges_open_at": settings.get("challenges_open_at"),
        "challenges_close_at": settings.get("challenges_close_at"),
        "challenges_closed_message": str(settings.get("challenges_closed_message") or "CTF \uBB38\uC81C\uB97C \uC544\uC9C1 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"),
    }


def is_challenges_visible(user: dict | None = None) -> tuple[bool, dict]:
    """Evaluate whether challenges should be visible.
    Returns (visible, info_dict) where info_dict contains opens_at/closes_at/closed_message.
    """
    from datetime import UTC, datetime

    if user is not None and str(user.get("role") or "") == "admin":
        settings = get_challenges_settings()
        return True, {
            "opens_at": settings.get("challenges_open_at"),
            "closes_at": settings.get("challenges_close_at"),
            "closed_message": settings.get("challenges_closed_message"),
        }

    settings = get_challenges_settings()

    # Toggle takes precedence: if explicitly open, ignore schedule
    if settings["challenges_open"]:
        return True, {
            "opens_at": settings.get("challenges_open_at"),
            "closes_at": settings.get("challenges_close_at"),
            "closed_message": settings.get("challenges_closed_message"),
        }

    # challenges_open == False — check schedule
    now = datetime.now(UTC)
    open_at = _parse_iso_optional(settings.get("challenges_open_at"))
    close_at = _parse_iso_optional(settings.get("challenges_close_at"))

    # If open_at is set and we've passed it → auto-open
    if open_at is not None and now >= open_at:
        # Also check if close_at passed
        if close_at is not None and now >= close_at:
            return False, {
                "opens_at": settings.get("challenges_open_at"),
                "closes_at": settings.get("challenges_close_at"),
                "closed_message": settings.get("challenges_closed_message"),
            }
        return True, {
            "opens_at": settings.get("challenges_open_at"),
            "closes_at": settings.get("challenges_close_at"),
            "closed_message": settings.get("challenges_closed_message"),
        }

    # Not yet open or no schedule → closed
    return False, {
        "opens_at": settings.get("challenges_open_at"),
        "closes_at": settings.get("challenges_close_at"),
        "closed_message": settings.get("challenges_closed_message"),
    }


def is_ranking_visible(user: dict | None = None) -> tuple[bool, dict]:
    """Evaluate whether rankings should be visible (schedule-aware)."""
    from datetime import UTC, datetime

    if user is not None and str(user.get("role") or "") == "admin":
        with exclusive_lock(SETTINGS_LOCK_FILE):
            settings = load_settings_unlocked()
        return True, {
            "opens_at": settings.get("ranking_open_at"),
            "closes_at": settings.get("ranking_close_at"),
            "closed_message": str(settings.get("ranking_closed_message") or ""),
        }

    ranking = get_ranking_settings()

    # Toggle takes precedence
    if ranking["ranking_open"]:
        with exclusive_lock(SETTINGS_LOCK_FILE):
            settings = load_settings_unlocked()
        return True, {
            "opens_at": settings.get("ranking_open_at"),
            "closes_at": settings.get("ranking_close_at"),
            "closed_message": ranking.get("ranking_closed_message", ""),
        }

    # ranking_open == False — check schedule
    now = datetime.now(UTC)
    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()
    open_at = _parse_iso_optional(settings.get("ranking_open_at"))
    close_at = _parse_iso_optional(settings.get("ranking_close_at"))

    if open_at is not None and now >= open_at:
        if close_at is not None and now >= close_at:
            return False, {
                "opens_at": settings.get("ranking_open_at"),
                "closes_at": settings.get("ranking_close_at"),
                "closed_message": ranking.get("ranking_closed_message", ""),
            }
        return True, {
            "opens_at": settings.get("ranking_open_at"),
            "closes_at": settings.get("ranking_close_at"),
            "closed_message": ranking.get("ranking_closed_message", ""),
        }

    return False, {
        "opens_at": settings.get("ranking_open_at"),
        "closes_at": settings.get("ranking_close_at"),
        "closed_message": ranking.get("ranking_closed_message", ""),
    }


def set_challenges_visibility(
    *,
    challenges_open: bool | None = None,
    challenges_open_at: str | None = ...,
    challenges_close_at: str | None = ...,
    challenges_closed_message: str | None = None,
) -> dict:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()

        if challenges_open is not None:
            settings["challenges_open"] = bool(challenges_open)

        if challenges_open_at is not ...:
            val = str(challenges_open_at or "").strip() or None
            if val is not None:
                parsed = _parse_iso_optional(val)
                if parsed is None:
                    raise ValueError("Invalid challenges_open_at datetime format")
            settings["challenges_open_at"] = val

        if challenges_close_at is not ...:
            val = str(challenges_close_at or "").strip() or None
            if val is not None:
                parsed = _parse_iso_optional(val)
                if parsed is None:
                    raise ValueError("Invalid challenges_close_at datetime format")
            settings["challenges_close_at"] = val

        # Validate: close_at >= open_at if both set
        oa = settings.get("challenges_open_at")
        ca = settings.get("challenges_close_at")
        if oa and ca:
            open_dt = _parse_iso_optional(oa)
            close_dt = _parse_iso_optional(ca)
            if open_dt and close_dt and close_dt < open_dt:
                raise ValueError("challenges_close_at must be >= challenges_open_at")

        if challenges_closed_message is not None:
            msg = str(challenges_closed_message).strip()
            if msg:
                settings["challenges_closed_message"] = msg

        save_settings_unlocked(settings)

    return get_challenges_settings()


def set_ranking_schedule(
    *,
    ranking_open_at: str | None = ...,
    ranking_close_at: str | None = ...,
) -> dict:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        settings = load_settings_unlocked()

        if ranking_open_at is not ...:
            val = str(ranking_open_at or "").strip() or None
            if val is not None:
                parsed = _parse_iso_optional(val)
                if parsed is None:
                    raise ValueError("Invalid ranking_open_at datetime format")
            settings["ranking_open_at"] = val

        if ranking_close_at is not ...:
            val = str(ranking_close_at or "").strip() or None
            if val is not None:
                parsed = _parse_iso_optional(val)
                if parsed is None:
                    raise ValueError("Invalid ranking_close_at datetime format")
            settings["ranking_close_at"] = val

        oa = settings.get("ranking_open_at")
        ca = settings.get("ranking_close_at")
        if oa and ca:
            open_dt = _parse_iso_optional(oa)
            close_dt = _parse_iso_optional(ca)
            if open_dt and close_dt and close_dt < open_dt:
                raise ValueError("ranking_close_at must be >= ranking_open_at")

        save_settings_unlocked(settings)

    ranking = get_ranking_settings()
    ranking["ranking_open_at"] = settings.get("ranking_open_at")
    ranking["ranking_close_at"] = settings.get("ranking_close_at")
    return ranking


__all__ = [
    "get_user_instance_limit",
    "set_user_instance_limit",
    "get_ranking_settings",
    "set_ranking_open",
    "get_challenges_settings",
    "is_challenges_visible",
    "is_ranking_visible",
    "set_challenges_visibility",
    "set_ranking_schedule",
    "SETTINGS_LOCK_FILE",
]
