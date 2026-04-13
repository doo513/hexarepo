import json
import os

from ..core.config import DATA_DIR, SETTINGS_FILE
from ..core.storage_utils import atomic_write_json

# Store module: no locking here. Services are responsible for locking.
DEFAULT_USER_INSTANCE_LIMIT = int(os.environ.get("HEXACTF_USER_INSTANCE_LIMIT", "2"))
MAX_USER_INSTANCE_LIMIT = int(os.environ.get("HEXACTF_MAX_USER_INSTANCE_LIMIT", "50"))


def _ensure_data_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def _normalize_limit(raw: object, fallback: int) -> int:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return int(fallback)
    if value < 0:
        return int(fallback)
    return value


def _normalize_limit_map(raw: object) -> dict[str, int | None]:
    if not isinstance(raw, dict):
        return {}

    result: dict[str, int | None] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not key:
            continue
        if value is None:
            result[key] = None
            continue
        try:
            limit = int(value)
        except (TypeError, ValueError):
            continue
        if limit < 0:
            continue
        result[key] = limit
    return result


def load_settings_unlocked() -> dict:
    settings = {
        "user_instance_limit": DEFAULT_USER_INSTANCE_LIMIT,
        "role_instance_limits": {},
        "user_instance_limits": {},
        "ranking_open": True,
        "ranking_closed_message": "This page has been closed. 마지막까지 최선을 다해 주세요!",
        "challenges_open": True,
        "challenges_open_at": None,
        "challenges_close_at": None,
        "challenges_closed_message": "CTF 문제를 아직 확인할 수 없습니다",
        "ranking_open_at": None,
        "ranking_close_at": None,
    }
    if not os.path.exists(SETTINGS_FILE):
        return settings

    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError):
        return settings

    if not isinstance(raw, dict):
        return settings

    settings["user_instance_limit"] = _normalize_limit(
        raw.get("user_instance_limit", DEFAULT_USER_INSTANCE_LIMIT),
        DEFAULT_USER_INSTANCE_LIMIT,
    )
    settings["role_instance_limits"] = _normalize_limit_map(raw.get("role_instance_limits"))
    settings["user_instance_limits"] = _normalize_limit_map(raw.get("user_instance_limits"))
    settings["ranking_open"] = bool(raw.get("ranking_open", True))
    settings["ranking_closed_message"] = str(raw.get("ranking_closed_message") or settings["ranking_closed_message"])
    settings["challenges_open"] = bool(raw.get("challenges_open", True))
    settings["challenges_open_at"] = raw.get("challenges_open_at") or None
    settings["challenges_close_at"] = raw.get("challenges_close_at") or None
    settings["challenges_closed_message"] = str(raw.get("challenges_closed_message") or settings["challenges_closed_message"])
    settings["ranking_open_at"] = raw.get("ranking_open_at") or None
    settings["ranking_close_at"] = raw.get("ranking_close_at") or None
    return settings


def save_settings_unlocked(settings: dict) -> None:
    _ensure_data_dir()
    atomic_write_json(SETTINGS_FILE, settings)
