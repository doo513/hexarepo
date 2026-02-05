from __future__ import annotations

from .errors import InstancesError
from . import runtime
from .store import STATE_LOCK_FILE, allocate_instance_id, exclusive_lock, load_state_unlocked, save_state_unlocked
from ..challenges.store import load_challenges
from ..settings_store import get_user_instance_limit


def start_instance(*, user: dict, problem_key: str) -> dict:
    challenges = load_challenges()
    if problem_key not in challenges:
        raise InstancesError(400, "Invalid problem key")

    challenge = challenges[problem_key]
    problem_dir = challenge["dir"]
    port = challenge.get("port")
    challenge_id = challenge.get("challenge_id", problem_key)
    title = challenge.get("title", problem_key)
    username = user.get("username")

    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}

        existing_for_problem = any(
            isinstance(inst, dict)
            and inst.get("owner") == username
            and inst.get("problem") == problem_key
            and inst.get("status") in {"starting", "running", "stopping"}
            for inst in instances.values()
        )
        if existing_for_problem:
            raise InstancesError(409, "Instance already running for this challenge")

        if user.get("role") != "admin":
            limit = get_user_instance_limit()
            active_count = sum(
                1
                for inst in instances.values()
                if isinstance(inst, dict)
                and inst.get("owner") == username
                and inst.get("status") in {"starting", "running", "stopping"}
            )
            if active_count >= limit:
                raise InstancesError(429, f"Instance limit reached ({limit}). Stop an instance first.")

        instance_id = allocate_instance_id(state)
        instances[str(instance_id)] = {
            "instance_id": instance_id,
            "problem": problem_key,
            "challenge_id": challenge_id,
            "title": title,
            "status": "starting",
            "owner": username,
        }
        state["instances"] = instances
        save_state_unlocked(state)

    try:
        info = runtime.deploy(problem_dir, instance_id, port=port)
    except ValueError:
        _delete_reserved_instance(instance_id)
        raise InstancesError(400, "Invalid port in challenges.json")
    except FileNotFoundError as e:
        _delete_reserved_instance(instance_id)
        raise InstancesError(500, str(e))
    except RuntimeError as e:
        _delete_reserved_instance(instance_id)
        raise InstancesError(500, str(e))

    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        inst = instances.get(str(instance_id)) or {
            "instance_id": instance_id,
            "problem": problem_key,
            "challenge_id": challenge_id,
            "title": title,
            "owner": username,
        }
        inst.update(
            {
                "port": info["external_port"],
                "container": info["container_name"],
                "status": "running",
            }
        )
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)

    return {
        "status": "ok",
        "instance_id": instance_id,
        "problem": problem_key,
        "title": title,
        "external_port": int(info["external_port"]),
    }


def stop_instance(*, user: dict, instance_id: int) -> dict:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        inst = instances.get(str(instance_id))

        if not inst:
            raise InstancesError(404, "instance not found")

        if user.get("role") != "admin" and inst.get("owner") != user.get("username"):
            raise InstancesError(403, "Forbidden")

        container_name = inst.get("container")
        if not container_name:
            raise InstancesError(500, "container name missing in state")

        inst["status"] = "stopping"
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)

    result = runtime.stop_container(container_name)

    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        if result.get("status") == "ok":
            instances.pop(str(instance_id), None)
        else:
            inst = instances.get(str(instance_id)) or {"instance_id": instance_id}
            inst["status"] = "error"
            inst["error"] = result.get("error", "stop failed")
            instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)

    if result.get("status") != "ok":
        raise InstancesError(500, result.get("error", "stop failed"))

    return {"status": "ok", "instance_id": instance_id, "container": container_name}


def list_instances(*, user: dict) -> list[dict]:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()

    instances_out: list[dict] = []
    for inst in (state.get("instances") or {}).values():
        if not isinstance(inst, dict):
            continue
        if user.get("role") != "admin" and inst.get("owner") != user.get("username"):
            continue

        row = {
            "instance_id": inst.get("instance_id"),
            "problem": inst.get("problem"),
            "title": inst.get("title"),
            "status": inst.get("status"),
            "port": inst.get("port"),
        }
        if user.get("role") == "admin":
            row["owner"] = inst.get("owner")
        instances_out.append(row)

    def _sort_key(item: dict) -> int:
        try:
            return int(item.get("instance_id") or 0)
        except (TypeError, ValueError):
            return 0

    instances_out.sort(key=_sort_key)
    return instances_out


def _delete_reserved_instance(instance_id: int) -> None:
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        (state.get("instances") or {}).pop(str(instance_id), None)
        save_state_unlocked(state)
