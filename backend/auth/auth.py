import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import UTC, datetime, timedelta

from ..core.storage_utils import atomic_write_json, exclusive_lock
from ..core.config import DATA_DIR, USERS_FILE
USERS_LOCK_FILE = USERS_FILE + ".lock"

PBKDF2_ITERATIONS = int(os.environ.get("HEXACTF_PBKDF2_ITERATIONS", "200000"))
DEFAULT_ADMIN_USERNAME = os.environ.get("HEXACTF_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("HEXACTF_ADMIN_PASSWORD", "admin")
ACTIVE_USER_WINDOW_SECONDS = 60
LAST_SEEN_THROTTLE_SECONDS = 30


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


MIN_PASSWORD_LENGTH = 8

def _validate_password(password: str) -> None:
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")

def _normalize_username(username: str) -> str:
    return (username or "").strip().lower()



def public_user(user: dict) -> dict:
    return {
        "username": user.get("username"),
        "display_name": user.get("display_name") or user.get("username"),
        "role": user.get("role", "user"),
        "status": user.get("status", "approved"),
        "score": int(user.get("score", 0)),
        "solved_problems": list(user.get("solved_problems", [])),
        "created_at": user.get("created_at"),
        "last_seen": user.get("last_seen"),
    }


def get_user(username: str) -> dict | None:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        return users.get(_normalize_username(username))


def list_public_users(include_pending: bool = True) -> list[dict]:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        rows = []
        for user in users.values():
            if not include_pending and str(user.get("status") or "approved") != "approved":
                continue
            rows.append(public_user(user))
        return rows


def _iter_public_users(include_admin: bool = False) -> list[dict]:
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        rows = []
        for user in users.values():
            if str(user.get("status") or "approved") != "approved":
                continue
            if not include_admin and user.get("role") == "admin":
                continue
            rows.append(user)
        return rows


def _parse_iso_datetime(raw: object) -> datetime | None:
    value = str(raw or "").strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def count_recent_active_users(*, within_seconds: int = ACTIVE_USER_WINDOW_SECONDS, include_admin: bool = True) -> int:
    cutoff = datetime.now(UTC) - timedelta(seconds=max(1, int(within_seconds or ACTIVE_USER_WINDOW_SECONDS)))
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        count = 0
        for user in users.values():
            if not isinstance(user, dict):
                continue
            if str(user.get("status") or "approved") != "approved":
                continue
            if not include_admin and user.get("role") == "admin":
                continue
            last_seen = _parse_iso_datetime(user.get("last_seen"))
            if last_seen and last_seen >= cutoff:
                count += 1
        return count


def touch_user_activity(username: str, *, min_interval_seconds: int = LAST_SEEN_THROTTLE_SECONDS) -> dict | None:
    username = _normalize_username(username)
    if not username:
        return None
    now = datetime.now(UTC)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not isinstance(user, dict):
            return None

        last_seen = _parse_iso_datetime(user.get("last_seen"))
        if last_seen and (now - last_seen).total_seconds() < max(1, int(min_interval_seconds or LAST_SEEN_THROTTLE_SECONDS)):
            return user

        user["last_seen"] = now.isoformat().replace("+00:00", "Z")
        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)
        return user


def get_problem_solve_count(problem_key: str) -> int:
    target = str(problem_key or "").strip()
    if not target:
        return 0
    rows = _iter_public_users(include_admin=False)
    return sum(1 for user in rows if target in (user.get("solved_problems") or []))


def get_scoreboard_summary() -> dict:
    rows = _iter_public_users(include_admin=False)
    total_players = len(rows)
    total_solves = 0
    for user in rows:
        solved = user.get("solved_problems") or []
        total_solves += len(solved) if isinstance(solved, list) else 0

    top_users = get_scoreboard(limit=3)
    return {
        "total_players": total_players,
        "total_solves": total_solves,
        "top_users": top_users,
    }


def _parse_solve_events(user: dict) -> list[dict]:
    raw = user.get("solve_events") or []
    if not isinstance(raw, list):
        return []
    events = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        problem = str(item.get("problem") or "").strip()
        solved_at = str(item.get("solved_at") or "").strip()
        score = int(item.get("score") or 0)
        if not problem or not solved_at:
            continue
        events.append({
            "problem": problem,
            "score": score,
            "solved_at": solved_at,
        })
    return events


def get_scoreboard_timeline(hours: int | None = None, limit: int = 10) -> dict:
    limit = max(1, int(limit or 10))
    now = datetime.now(UTC)

    rows = _iter_public_users(include_admin=False)
    rows.sort(key=lambda user: (-int(user.get("score", 0)), str(user.get("username") or "")))
    selected = rows[:limit]

    parsed_series: list[dict] = []
    all_timestamps: list[datetime] = []
    for user in selected:
        username = str(user.get("username") or "unknown")
        display_name = str(user.get("display_name") or username)
        current_score = int(user.get("score", 0))
        solved_count = len(user.get("solved_problems") or []) if isinstance(user.get("solved_problems"), list) else 0
        events = []
        for item in _parse_solve_events(user):
            try:
                solved_at = datetime.fromisoformat(item["solved_at"].replace("Z", "+00:00"))
            except ValueError:
                continue
            events.append({
                "ts": solved_at,
                "score": int(item["score"]),
                "problem": item["problem"],
            })
            all_timestamps.append(solved_at)
        events.sort(key=lambda item: item["ts"])
        parsed_series.append({
            "username": username,
            "display_name": display_name,
            "score": current_score,
            "solved_count": solved_count,
            "events": events,
        })

    if hours is not None:
        hours = max(1, int(hours or 1))
        start = now - timedelta(hours=hours)
    elif all_timestamps:
        start = min(all_timestamps)
    else:
        start = now - timedelta(hours=24)

    start_iso = start.isoformat().replace("+00:00", "Z")
    end_iso = now.isoformat().replace("+00:00", "Z")

    series = []
    for item in parsed_series:
        filtered_events = [event for event in item["events"] if event["ts"] >= start]
        points = []
        running = 0
        for event in filtered_events:
            running += int(event["score"])
            points.append({
                "ts": event["ts"].isoformat().replace("+00:00", "Z"),
                "score": running,
                "problem": event["problem"],
            })
        if not points:
            points = [{"ts": start_iso, "score": 0}]
        series.append({
            "username": item["username"],
            "display_name": item["display_name"],
            "score": item["score"],
            "solved_count": item["solved_count"],
            "points": points,
        })

    return {
        "start_at": start_iso,
        "end_at": end_iso,
        "series": series,
    }


def get_problem_solve_counts(include_admin: bool = False) -> dict[str, int]:
    counts: dict[str, int] = {}
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        for user in users.values():
            if not isinstance(user, dict):
                continue
            if not include_admin and user.get("role") == "admin":
                continue
            solved = user.get("solved_problems") or []
            if not isinstance(solved, list):
                continue
            for problem_key in solved:
                key = str(problem_key or "").strip()
                if not key:
                    continue
                counts[key] = counts.get(key, 0) + 1
    return counts

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
    _validate_password(password)

    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        if username in users:
            raise ValueError("user already exists")

        # Check display_name duplicate (case-insensitive) across all users (pending + approved)
        effective_dn = (display_name or username).strip().lower()
        for existing_user in users.values():
            existing_dn = str(existing_user.get("display_name") or existing_user.get("username") or "").strip().lower()
            if existing_dn and existing_dn == effective_dn:
                raise ValueError("display name already in use")

        user = {
            "username": username,
            "display_name": display_name or username,
            "role": role,
            "status": "approved" if role == "admin" else "pending",
            "password_hash": _hash_password(password),
            "score": 0,
            "solved_problems": [],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "last_seen": None,
            "session_nonce": secrets.token_hex(16),
        }

        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)
        return user


def authenticate_user(username: str, password: str) -> tuple[dict | None, str | None]:
    username_norm = _normalize_username(username)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username_norm)
        if not user:
            return None, "invalid_credentials"

        ok, upgraded_hash = _password_matches(password, user.get("password_hash", ""))
        if not ok:
            return None, "invalid_credentials"

        status = str(user.get("status") or "approved")
        if status != "approved":
            return None, status

        if upgraded_hash:
            user["password_hash"] = upgraded_hash

        user["session_nonce"] = secrets.token_hex(16)
        users[username_norm] = user
        data["users"] = users
        _save_raw_unlocked(data)

        return user, None


def change_own_password(username: str, current_password: str, new_password: str) -> dict:
    username = _normalize_username(username)
    _validate_password(new_password)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not user:
            raise ValueError("user not found")
        ok, _ = _password_matches(current_password, user.get("password_hash", ""))
        if not ok:
            raise ValueError("current password is incorrect")
        user["password_hash"] = _hash_password(new_password)
        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)
        return user


def reset_password(username: str, password: str) -> dict:
    username = _normalize_username(username)
    if not password:
        raise ValueError("password required")

    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not user:
            raise ValueError("user not found")

        user["password_hash"] = _hash_password(password)
        users[username] = user
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


def approve_user(username: str) -> dict:
    username = _normalize_username(username)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not user:
            raise ValueError("user not found")
        user["status"] = "approved"
        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)
        return user


def reject_user(username: str) -> None:
    username = _normalize_username(username)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not user:
            raise ValueError("user not found")
        if user.get("role") == "admin":
            raise ValueError("cannot reject admin")
        del users[username]
        data["users"] = users
        _save_raw_unlocked(data)


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
            "status": "approved",
            "password_hash": _hash_password(DEFAULT_ADMIN_PASSWORD),
            "score": 0,
            "solved_problems": [],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "last_seen": None,
            "session_nonce": secrets.token_hex(16),
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
            had_score = int(user.get("score") or 0) != 0
            had_solves = bool(user.get("solved_problems"))
            had_events = bool(user.get("solve_events"))
            if had_score or had_solves or had_events:
                user["score"] = 0
                user["solved_problems"] = []
                user["solve_events"] = []
                updated += 1
        data["users"] = users
        _save_raw_unlocked(data)
        return updated


def mark_problem_solved(username: str, problem_key: str, score: int) -> tuple[bool, dict]:
    username = _normalize_username(username)
    with exclusive_lock(USERS_LOCK_FILE):
        data = _load_raw_unlocked()
        users = data.get("users", {})
        user = users.get(username)
        if not user:
            raise ValueError("user not found")

        solved = user.get("solved_problems") or []
        if not isinstance(solved, list):
            solved = []

        if problem_key in solved:
            users[username] = user
            data["users"] = users
            _save_raw_unlocked(data)
            return False, public_user(user)

        solved.append(problem_key)
        user["solved_problems"] = solved
        events = user.get("solve_events") or []
        if not isinstance(events, list):
            events = []
        events.append({
            "problem": problem_key,
            "score": int(score),
            "solved_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        })
        user["solve_events"] = events
        current_score = int(user.get("score", 0))
        user["score"] = current_score + int(score)
        users[username] = user
        data["users"] = users
        _save_raw_unlocked(data)
        return True, public_user(user)
