from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets

from ..core.config import DATA_DIR, FLAG_SECRET_FILE
from ..core.storage_utils import atomic_write_text, exclusive_lock

FLAG_SECRET_LOCK_FILE = FLAG_SECRET_FILE + ".lock"
RUNTIME_FLAG_DIR = os.path.join(DATA_DIR, "runtime_flags")
DEFAULT_FLAG_PREFIX = "2026HL"
DEFAULT_FLAG_TOKEN_HEX_LEN = 32

_FLAG_SECRET_CACHE: str | None = None


def _get_flag_secret() -> str:
    global _FLAG_SECRET_CACHE
    if _FLAG_SECRET_CACHE:
        return _FLAG_SECRET_CACHE

    env_secret = os.environ.get("HEXACTF_FLAG_SECRET")
    if env_secret:
        _FLAG_SECRET_CACHE = env_secret
        return env_secret

    with exclusive_lock(FLAG_SECRET_LOCK_FILE):
        if _FLAG_SECRET_CACHE:
            return _FLAG_SECRET_CACHE

        if os.path.exists(FLAG_SECRET_FILE):
            with open(FLAG_SECRET_FILE, "r", encoding="utf-8") as f:
                existing = f.read().strip()
            if existing:
                _FLAG_SECRET_CACHE = existing
                return existing

        secret = secrets.token_hex(32)
        atomic_write_text(FLAG_SECRET_FILE, secret + "\n")
        try:
            os.chmod(FLAG_SECRET_FILE, 0o600)
        except OSError:
            pass
        _FLAG_SECRET_CACHE = secret
        return secret


def dynamic_flag_enabled(challenge: dict) -> bool:
    raw_mode = str(challenge.get("flag_mode") or "").strip().lower()
    if raw_mode in {"dynamic", "hmac", "derived"}:
        return True
    return challenge.get("dynamic_flag") is True


def _flag_prefix(challenge: dict) -> str:
    prefix = str(
        challenge.get("flag_prefix")
        or os.environ.get("HEXACTF_FLAG_PREFIX")
        or DEFAULT_FLAG_PREFIX
    ).strip()
    return prefix or DEFAULT_FLAG_PREFIX


def _flag_token_hex_len(challenge: dict) -> int:
    raw = challenge.get("flag_token_hex_len") or os.environ.get("HEXACTF_FLAG_TOKEN_HEX_LEN")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = DEFAULT_FLAG_TOKEN_HEX_LEN
    return max(16, min(value, 64))


def _normalize_problem_part(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_]+", "_", str(value or "").strip())
    normalized = normalized.strip("_")
    return normalized[:32] or "challenge"


def derive_dynamic_flag(*, challenge: dict, problem_key: str, username: str) -> str:
    challenge_id = str(challenge.get("challenge_id") or problem_key)
    payload = {
        "version": 1,
        "username": str(username),
        "problem_key": str(problem_key),
        "challenge_id": challenge_id,
        "salt": str(challenge.get("flag_salt") or ""),
    }
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hmac.new(
        _get_flag_secret().encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    token = digest[: _flag_token_hex_len(challenge)]
    if challenge.get("flag_include_problem") is True:
        token = f"{_normalize_problem_part(challenge_id)}_{token}"
    return f"{_flag_prefix(challenge)}{{{token}}}"


def container_flag_path(challenge: dict) -> str | None:
    raw = challenge.get("container_flag_path") or challenge.get("flag_mount_path")
    value = str(raw or "").strip()
    if not value:
        return None
    if not value.startswith("/"):
        raise ValueError("container_flag_path must be an absolute container path")
    return value


def runtime_flag_file(instance_id: int) -> str:
    return os.path.join(RUNTIME_FLAG_DIR, f"{int(instance_id)}.flag")


def write_runtime_flag_file(*, instance_id: int, flag: str) -> str:
    os.makedirs(RUNTIME_FLAG_DIR, exist_ok=True)
    path = runtime_flag_file(instance_id)
    atomic_write_text(path, str(flag).rstrip("\n") + "\n")
    try:
        os.chmod(path, 0o444)
    except OSError:
        pass
    return path


def cleanup_runtime_flag_file(instance_id: int) -> None:
    try:
        path = runtime_flag_file(instance_id)
    except (TypeError, ValueError):
        return
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def build_flag_environment(*, challenge: dict, flag: str) -> dict[str, str]:
    env = {
        "FLAG": flag,
        "HEXACTF_FLAG": flag,
        "CHALLENGE_FLAG": flag,
    }
    mount_path = container_flag_path(challenge)
    if mount_path:
        env["FLAG_PATH"] = mount_path

    extra = challenge.get("flag_env")
    names: list[str]
    if isinstance(extra, str):
        names = [extra]
    elif isinstance(extra, list):
        names = [str(item) for item in extra]
    else:
        names = []
    for name in names:
        name = name.strip()
        if name:
            env[name] = flag
    return env
