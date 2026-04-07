from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from ..core.config import INSTANCES_FILE
from ..core.storage_utils import atomic_write_json, exclusive_lock

# Store module: state file ownership lives here (lock + read/write helpers).
STATE_FILE = INSTANCES_FILE
STATE_LOCK_FILE = STATE_FILE + ".lock"
ACTIVE_INSTANCE_STATUSES = {"starting", "running", "stopping"}


def _default_state() -> dict:
    return {"next_instance_id": 1, "instances": {}}


def _normalize_state(raw: object) -> dict:
    if not isinstance(raw, dict):
        return _default_state()

    next_instance_id = raw.get("next_instance_id", 1)
    try:
        next_instance_id_int = int(next_instance_id)
    except (TypeError, ValueError):
        next_instance_id_int = 1
    if next_instance_id_int < 1:
        next_instance_id_int = 1

    instances = raw.get("instances")
    if not isinstance(instances, dict):
        instances = {}

    raw["next_instance_id"] = next_instance_id_int
    raw["instances"] = instances
    return raw


def load_state_unlocked() -> dict:
    if not os.path.exists(STATE_FILE):
        return _default_state()
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        try:
            raw = json.load(f)
        except json.JSONDecodeError:
            return _default_state()

    return _normalize_state(raw)


def save_state_unlocked(state: dict) -> None:
    atomic_write_json(STATE_FILE, state)


def allocate_instance_id(state: dict) -> int:
    instance_id = int(state.get("next_instance_id", 1))
    state["next_instance_id"] += 1
    return instance_id


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _active_count(instances: dict, owner: str) -> int:
    return sum(
        1
        for inst in instances.values()
        if isinstance(inst, dict)
        and inst.get("owner") == owner
        and inst.get("status") in ACTIVE_INSTANCE_STATUSES
    )


def _has_active_problem(instances: dict, owner: str, problem_key: str) -> bool:
    return any(
        isinstance(inst, dict)
        and inst.get("owner") == owner
        and inst.get("problem") == problem_key
        and inst.get("status") in ACTIVE_INSTANCE_STATUSES
        for inst in instances.values()
    )


def reserve_starting(*, owner: str, problem_key: str, challenge_id: str, title: str, limit: int | None) -> int:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}

        if _has_active_problem(instances, owner, problem_key):
            raise ValueError("Instance already running for this challenge")

        if limit is not None and _active_count(instances, owner) >= int(limit):
            raise OverflowError(f"Instance limit reached ({int(limit)}). Stop an instance first.")

        instance_id = allocate_instance_id(state)
        instances[str(instance_id)] = {
            "instance_id": instance_id,
            "problem": problem_key,
            "challenge_id": challenge_id,
            "title": title,
            "status": "starting",
            "owner": owner,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        state["instances"] = instances
        save_state_unlocked(state)
        return instance_id


def count_active_by_owner(owner: str) -> int:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        return _active_count(instances, owner)


def get_instance(instance_id: int) -> dict | None:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        inst = (state.get("instances") or {}).get(str(instance_id))
        if isinstance(inst, dict):
            return dict(inst)
        return None


def mark_stopping(instance_id: int) -> None:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        inst = instances.get(str(instance_id))
        if not isinstance(inst, dict):
            raise KeyError("instance not found")
        inst["status"] = "stopping"
        inst["updated_at"] = _now_iso()
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)


def try_mark_stopping(*, instance_id: int, requester_username: str | None, requester_role: str | None) -> tuple[str, dict | None]:
    # Stop race mitigation: check permission + state transition in one lock scope.
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        inst = instances.get(str(instance_id))
        if not isinstance(inst, dict):
            return "not_found", None

        is_admin = requester_role == "admin"
        owner = inst.get("owner")
        if not is_admin and owner != requester_username:
            return "forbidden", None

        status = inst.get("status")
        if status == "stopping":
            return "already_stopping", dict(inst)
        if status != "running":
            return "not_running", dict(inst)
        if not inst.get("container"):
            return "missing_container", dict(inst)

        inst["status"] = "stopping"
        inst["updated_at"] = _now_iso()
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)
        return "ready", dict(inst)


def mark_running(instance_id: int, *, port: int, container_id: str, url: str | None = None) -> None:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        inst = instances.get(str(instance_id))
        if not isinstance(inst, dict):
            raise KeyError("instance not found")
        inst["status"] = "running"
        inst["port"] = int(port)
        inst["container"] = container_id
        inst["updated_at"] = _now_iso()
        if url:
            inst["url"] = url
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)


def mark_error(instance_id: int, reason: str) -> None:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        inst = instances.get(str(instance_id))
        if not isinstance(inst, dict):
            inst = {"instance_id": instance_id}
        inst["status"] = "error"
        inst["error"] = str(reason)
        inst["updated_at"] = _now_iso()
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)


def remove_instance(instance_id: int) -> None:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        (state.get("instances") or {}).pop(str(instance_id), None)
        save_state_unlocked(state)


def list_instances_snapshot() -> list[dict]:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        return [dict(inst) for inst in instances.values() if isinstance(inst, dict)]


__all__ = [
    "STATE_FILE",
    "STATE_LOCK_FILE",
    "ACTIVE_INSTANCE_STATUSES",
    "load_state_unlocked",
    "save_state_unlocked",
    "allocate_instance_id",
    "reserve_starting",
    "count_active_by_owner",
    "get_instance",
    "mark_stopping",
    "try_mark_stopping",
    "mark_running",
    "mark_error",
    "remove_instance",
    "list_instances_snapshot",
]
