from fastapi import APIRouter, HTTPException, Request

from . import auto_deploy
from . import auto_stop
from . import models
from .deps import get_current_user
from .challenge_store import load_challenges
from .settings_store import get_user_instance_limit
from .state_store import STATE_LOCK_FILE, allocate_instance_id, load_state_unlocked, save_state_unlocked
from .storage_utils import exclusive_lock

router = APIRouter()

def _server_base_url(request: Request) -> str:
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    host = (forwarded_host or request.url.hostname or "localhost").split(",")[0].strip()
    host = host.split(":")[0]
    scheme = (forwarded_proto or request.url.scheme or "http").split(",")[0].strip()
    return f"{scheme}://{host}"


@router.post("/start")
def start(req: models.StartRequest, request: Request):
    user = get_current_user(request)
    problem_key = req.problem

    challenges = load_challenges()

    if problem_key not in challenges:
        raise HTTPException(status_code=400, detail="Invalid problem key")

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
            raise HTTPException(status_code=409, detail="Instance already running for this challenge")

        if user.get("role") != "admin":
            limit = get_user_instance_limit()
            active_count = sum(
                1 for inst in instances.values()
                if isinstance(inst, dict)
                and inst.get("owner") == username
                and inst.get("status") in {"starting", "running", "stopping"}
            )
            if active_count >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Instance limit reached ({limit}). Stop an instance first."
                )

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
        info = auto_deploy.deploy(problem_dir, instance_id, port=port)
    except ValueError:
        with exclusive_lock(STATE_LOCK_FILE):
            state = load_state_unlocked()
            (state.get("instances") or {}).pop(str(instance_id), None)
            save_state_unlocked(state)
        raise HTTPException(status_code=400, detail="Invalid port in challenges.json")
    except FileNotFoundError as e:
        with exclusive_lock(STATE_LOCK_FILE):
            state = load_state_unlocked()
            (state.get("instances") or {}).pop(str(instance_id), None)
            save_state_unlocked(state)
        raise HTTPException(status_code=500, detail=str(e))
    except RuntimeError as e:
        with exclusive_lock(STATE_LOCK_FILE):
            state = load_state_unlocked()
            (state.get("instances") or {}).pop(str(instance_id), None)
            save_state_unlocked(state)
        raise HTTPException(status_code=500, detail=str(e))

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
        inst.update({
            "port": info["external_port"],
            "container": info["container_name"],
            "status": "running",
        })
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)

    url = f"{_server_base_url(request)}:{info['external_port']}"

    return {
        "status": "ok",
        "instance_id": instance_id,
        "problem": problem_key,
        "title": challenge.get("title", problem_key),
        "url": url
    }


@router.post("/stop/{instance_id}")
def stop(instance_id: int, request: Request):
    user = get_current_user(request)

    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        inst = instances.get(str(instance_id))

        if not inst:
            raise HTTPException(status_code=404, detail="instance not found")

        if user.get("role") != "admin" and inst.get("owner") != user.get("username"):
            raise HTTPException(status_code=403, detail="Forbidden")

        container_name = inst.get("container")
        if not container_name:
            raise HTTPException(status_code=500, detail="container name missing in state")

        inst["status"] = "stopping"
        instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)

    result = auto_stop.stop_container(container_name)

    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()
        instances = state.get("instances") or {}
        if result["status"] == "ok":
            instances.pop(str(instance_id), None)
        else:
            inst = instances.get(str(instance_id)) or {"instance_id": instance_id}
            inst["status"] = "error"
            inst["error"] = result.get("error", "stop failed")
            instances[str(instance_id)] = inst
        state["instances"] = instances
        save_state_unlocked(state)

    if result["status"] != "ok":
        raise HTTPException(status_code=500, detail=result.get("error", "stop failed"))

    return {"status": "ok", "instance_id": instance_id, "container": container_name}


@router.get("/api/instances")
def list_instances(request: Request):
    user = get_current_user(request)
    with exclusive_lock(STATE_LOCK_FILE):
        state = load_state_unlocked()

    server_host = _server_base_url(request)
    instances = []
    for inst in (state.get("instances") or {}).values():
        if not isinstance(inst, dict):
            continue
        if user.get("role") != "admin" and inst.get("owner") != user.get("username"):
            continue

        port = inst.get("port")
        url = f"{server_host}:{port}" if port else None
        row = {
            "instance_id": inst.get("instance_id"),
            "problem": inst.get("problem"),
            "title": inst.get("title"),
            "status": inst.get("status"),
            "url": url,
        }
        if user.get("role") == "admin":
            row["owner"] = inst.get("owner")
        instances.append(row)

    def _sort_key(item: dict) -> int:
        try:
            return int(item.get("instance_id") or 0)
        except (TypeError, ValueError):
            return 0

    instances.sort(key=_sort_key)
    return {"status": "ok", "instances": instances}
