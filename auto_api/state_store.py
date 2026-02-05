import json
import os

from .storage_utils import atomic_write_json, exclusive_lock

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
STATE_FILE = os.path.join(ROOT_DIR, "instances.json")
STATE_LOCK_FILE = STATE_FILE + ".lock"


def load_state_unlocked() -> dict:
    default_state = {"next_instance_id": 1, "instances": {}}
    if not os.path.exists(STATE_FILE):
        return default_state
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        try:
            raw = json.load(f)
        except json.JSONDecodeError:
            return default_state

    if not isinstance(raw, dict):
        return default_state

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


def load_state() -> dict:
    with exclusive_lock(STATE_LOCK_FILE):
        return load_state_unlocked()


def save_state_unlocked(state: dict) -> None:
    atomic_write_json(STATE_FILE, state)


def save_state(state: dict) -> None:
    with exclusive_lock(STATE_LOCK_FILE):
        save_state_unlocked(state)


def allocate_instance_id(state: dict) -> int:
    instance_id = state["next_instance_id"]
    state["next_instance_id"] += 1
    return instance_id
