import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from .storage_utils import atomic_write_text, exclusive_lock

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT_DIR, "data")
SECRET_FILE = os.path.join(DATA_DIR, "secret.key")
SECRET_LOCK_FILE = SECRET_FILE + ".lock"

DEFAULT_TTL = int(os.environ.get("HEXACTF_TOKEN_TTL", "86400"))

_SECRET_CACHE: str | None = None


def _get_secret() -> str:
    global _SECRET_CACHE
    if _SECRET_CACHE:
        return _SECRET_CACHE

    env_secret = os.environ.get("HEXACTF_SECRET")
    if env_secret:
        _SECRET_CACHE = env_secret
        return env_secret

    with exclusive_lock(SECRET_LOCK_FILE):
        if _SECRET_CACHE:
            return _SECRET_CACHE

        if os.path.exists(SECRET_FILE):
            with open(SECRET_FILE, "r", encoding="utf-8") as f:
                existing = f.read().strip()
            if existing:
                _SECRET_CACHE = existing
                return existing

        secret = secrets.token_hex(32)
        atomic_write_text(SECRET_FILE, secret + "\n")
        try:
            os.chmod(SECRET_FILE, 0o600)
        except OSError:
            pass
        _SECRET_CACHE = secret
        return secret


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def create_access_token(username: str, role: str, ttl: int = DEFAULT_TTL) -> str:
    payload = {
        "sub": username,
        "role": role,
        "exp": int(time.time()) + int(ttl),
    }
    body = _b64encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    secret = _get_secret()
    sig = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_token(token: str) -> tuple[bool, dict]:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        return False, {"error": "invalid token"}

    secret = _get_secret()
    expected = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False, {"error": "invalid signature"}

    try:
        payload = json.loads(_b64decode(body).decode("utf-8"))
    except json.JSONDecodeError:
        return False, {"error": "invalid payload"}

    exp = payload.get("exp")
    if exp is not None and int(exp) < int(time.time()):
        return False, {"error": "token expired"}

    return True, payload
