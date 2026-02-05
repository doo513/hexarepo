import json
import os

from .storage_utils import atomic_write_json, exclusive_lock

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
SETTINGS_LOCK_FILE = SETTINGS_FILE + ".lock"

DEFAULT_USER_INSTANCE_LIMIT = int(os.environ.get("HEXACTF_USER_INSTANCE_LIMIT", "2"))
MAX_USER_INSTANCE_LIMIT = int(os.environ.get("HEXACTF_MAX_USER_INSTANCE_LIMIT", "50"))


def _ensure_data_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def load_settings_unlocked() -> dict:
    settings = {"user_instance_limit": DEFAULT_USER_INSTANCE_LIMIT}
    if not os.path.exists(SETTINGS_FILE):
        return settings

    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError):
        return settings

    if not isinstance(raw, dict):
        return settings

    limit = raw.get("user_instance_limit", DEFAULT_USER_INSTANCE_LIMIT)
    try:
        limit_int = int(limit)
    except (TypeError, ValueError):
        limit_int = DEFAULT_USER_INSTANCE_LIMIT

    if limit_int < 0:
        limit_int = DEFAULT_USER_INSTANCE_LIMIT

    settings["user_instance_limit"] = limit_int
    return settings


def load_settings() -> dict:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        return load_settings_unlocked()


def save_settings_unlocked(settings: dict) -> None:
    _ensure_data_dir()
    atomic_write_json(SETTINGS_FILE, settings)


def save_settings(settings: dict) -> None:
    with exclusive_lock(SETTINGS_LOCK_FILE):
        save_settings_unlocked(settings)


def get_user_instance_limit() -> int:
    settings = load_settings()
    return int(settings.get("user_instance_limit", DEFAULT_USER_INSTANCE_LIMIT))


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

