import hashlib
import hmac
import json
import os
import secrets
import time

from ..storage_utils import atomic_write_json, exclusive_lock

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.dirname(BASE_DIR)
ROOT_DIR = os.path.dirname(API_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
USERS_LOCK_FILE = USERS_FILE + ".lock"

PBKDF2_ITERATIONS = int(os.environ.get("HEXACTF_PBKDF2_ITERATIONS", "200000"))
DEFAULT_ADMIN_USERNAME = os.environ.get("HEXACTF_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("HEXACTF_ADMIN_PASSWORD", "admin")


def _ensure_data_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_raw_unlocked() -> dict:
    if not os.path.exists(USERS_FILE):
        return {"users": {}}

    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise RuntimeError("users.json is corrupted (invalid JSON)") from e

    if isinstance(data, dict) and "users" in data and isinstance(data["users"], dict):
        return data

    if isinstance(data, dict):
        return {"users": data}

    raise RuntimeError("users.json has invalid structure")


def _save_raw_unlocked(data: dict) -> None:
    _ensure_data_dir()
    atomic_write_json(USERS_FILE, data)


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    iterations = PBKDF2_ITERATIONS
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def _password_matches(password: str, stored: str) -> tuple[bool, str | None]:
    if not stored:
        return False, None

    if stored.startswith("pbkdf2_sha256$"):
        parts = stored.split("$", 3)
        if len(parts) != 4:
            return False, None
        _, iter_str, salt_hex, hash_hex = parts
        try:
            iterations = int(iter_str)
            salt = bytes.fromhex(salt_hex)
        except ValueError:
            return False, None
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        ok = hmac.compare_digest(dk.hex(), hash_hex)
        return ok, None

    # legacy format: "{salt}${sha256(salt+password)}"
    if "$" in stored:
        salt, digest_hex = stored.split("$", 1)
        computed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
        ok = hmac.compare_digest(computed, digest_hex)
        return ok, (_hash_password(password) if ok else None)

    return False, None


def _normalize_username(username: str) -> str:
    return (username or "").strip().lower()


def public_user(user: dict) -> dict:
    return {
        "username": user.get("username"),
        "display_name": user.get("display_name") or user.get("username"),
        "role": user.get("role", "user"),
        "score": int(user.get("score", 0)),
        "solved_problems": list(user.get("solved_problems", [])),
        "created_at": user.get("created_at"),
    }


def get_user(username: str) -> dict | None:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        return users.get(_normalize_username(username))


def list_public_users() -> list[dict]:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        return [public_user(user) for user in users.values()]

def get_scoreboard(limit: int = 100, include_admin: bool = False) -> list[dict]:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        rows = []
        for user in users.values():
            if not include_admin and user.get("role") == "admin":
                continue
            solved = user.get("solved_problems") or []
            rows.append({
                "username": user.get("username"),
                "display_name": user.get("display_name") or user.get("username"),
                "score": int(user.get("score", 0)),
                "solved_count": len(solved) if isinstance(solved, list) else int(user.get("solved_count", 0))
            })

        rows.sort(key=lambda x: (-x["score"], str(x["username"])))
        for idx, row in enumerate(rows):
            row["rank"] = idx + 1
        return rows[:max(1, limit)]


def create_user(username: str, password: str, display_name: str | None = None, role: str = "user") -> dict:
    username = _normalize_username(username)
    if not username or not password:
        raise ValueError("username and password required")

    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        if username in users:
            raise ValueError("user already exists")

        user = {
            "username": username,
            "display_name": display_name or username,
            "role": role,
            "password_hash": _hash_password(password),
            "score": 0,
            "solved_problems": [],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)
        return user


def authenticate_user(username: str, password: str) -> dict | None:
    username_norm = _normalize_username(username)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username_norm)
        if not user:
            return None

        ok, upgraded_hash = _password_matches(password, user.get("password_hash", ""))
        if not ok:
            return None

        if upgraded_hash:
            user["password_hash"] = upgraded_hash
            users[username_norm] = user
            data["users"] = users
            _save_raw_unlocked(data)

        return user


def update_role(username: str, role: str) -> dict:
    if role not in {"admin", "user"}:
        raise ValueError("invalid role")

    username = _normalize_username(username)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not user:
            raise ValueError("user not found")

        if user.get("role") == "admin" and role != "admin":
            admin_count = sum(1 for u in users.values() if u.get("role") == "admin")
            if admin_count <= 1:
                raise ValueError("cannot demote last admin")

        user["role"] = role
        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)
        return user


def delete_user(username: str) -> None:
    username = _normalize_username(username)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not user:
            raise ValueError("user not found")

        if user.get("role") == "admin":
            admin_count = sum(1 for u in users.values() if u.get("role") == "admin")
            if admin_count <= 1:
                raise ValueError("cannot delete last admin")

        del users[username]
        data["users"] = users
        _save_raw_unlocked(data)


def ensure_default_admin() -> None:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        has_admin = any(u.get("role") == "admin" for u in users.values() if isinstance(u, dict))
        if has_admin:
            return

        username = _normalize_username(DEFAULT_ADMIN_USERNAME)
        if username in users:
            users[username]["role"] = "admin"
            data["users"] = users
            _save_raw_unlocked(data)
            return

        user = {
            "username": username,
            "display_name": "Administrator",
            "role": "admin",
            "password_hash": _hash_password(DEFAULT_ADMIN_PASSWORD),
            "score": 0,
            "solved_problems": [],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)

def reset_scoreboard() -> int:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        updated = 0
        for user in users.values():
            if user.get("score") != 0 or user.get("solved_problems"):
                user["score"] = 0
                user["solved_problems"] = []
                updated += 1
        data["users"] = users
        _save_raw_unlocked(data)
        return updated
