from __future__ import annotations

import json
import os

from .settings_service import get_user_instance_limit
from .instance_store import (
    list_instances_snapshot,
    mark_error,
    mark_running,
    remove_instance,
    reserve_starting,
    try_mark_stopping,
)
from ..container import auto_deploy, auto_stop
from .routes.challenges import load_challenges, safe_join


class InstancesError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = int(status_code)
        self.detail = str(detail)


def _deploy(
    problem_dir: str,
    instance_id: int,
    *,
    problem_key: str,
    port: int | None = None,
) -> dict:
    return auto_deploy.deploy(
        problem_dir,
        instance_id,
        port=port,
        name_prefix=problem_key,
    )


def _stop_container(container_name: str) -> dict:
    return auto_stop.stop_container(container_name)


def _container_already_removed(result: dict) -> bool:
    if result.get("status") == "ok":
        return False
    return "not found" in str(result.get("error", "")).lower()


def start_instance(*, user: dict, problem_key: str) -> dict:
    try:
        challenges = load_challenges()
    except FileNotFoundError:
        raise InstancesError(500, "challenges.json not found")
    except json.JSONDecodeError:
        raise InstancesError(500, "challenges.json is invalid JSON")
    if not isinstance(challenges, dict):
        raise InstancesError(500, "challenges.json must be an object")
    if problem_key not in challenges:
        raise InstancesError(400, "Invalid problem key")

    challenge = challenges[problem_key]
    if not isinstance(challenge, dict):
        raise InstancesError(500, "challenge entry is invalid")
    base_dir = challenge.get("dir")
    if not base_dir:
        raise InstancesError(500, "challenge dir missing")
    if challenge.get("container") is False:
        raise InstancesError(400, "No container for this challenge")

    container_dir = challenge.get("container_dir")
    if container_dir:
        if os.path.isabs(container_dir):
            problem_dir = container_dir
        else:
            problem_dir = safe_join(base_dir, container_dir)
        if not problem_dir:
            raise InstancesError(500, "container_dir is invalid")
    else:
        problem_dir = base_dir
    port = challenge.get("port")
    challenge_id = challenge.get("challenge_id", problem_key)
    title = challenge.get("title", problem_key)
    username = user.get("username")

    if not username:
        raise InstancesError(401, "Unauthorized")

    limit = get_user_instance_limit(user=user)
    try:
        instance_id = reserve_starting(
            owner=username,
            problem_key=problem_key,
            challenge_id=str(challenge_id),
            title=str(title),
            limit=limit,
        )
    except OverflowError as e:
        raise InstancesError(429, str(e))
    except ValueError as e:
        raise InstancesError(409, str(e))

    try:
        info = _deploy(
            problem_dir,
            instance_id,
            problem_key=problem_key,
            port=port,
        )
    except ValueError as e:
        mark_error(instance_id, str(e))
        raise InstancesError(400, "Invalid port in challenges.json")
    except FileNotFoundError as e:
        mark_error(instance_id, str(e))
        raise InstancesError(500, str(e))
    except RuntimeError as e:
        mark_error(instance_id, str(e))
        raise InstancesError(500, str(e))

    external_port = int(info["external_port"])

    proxy_template = os.environ.get("HEXACTF_PROXY_URL_TEMPLATE")
    proxy_domain = os.environ.get("HEXACTF_PROXY_DOMAIN")

    if proxy_template:
        display_url = proxy_template.replace("{port}", str(external_port))
    elif proxy_domain:
        display_url = f"http://p-{external_port}.{proxy_domain}"
    else:
        host_ip = os.environ.get("HOST_IP", "localhost")
        display_url = f"http://{host_ip}:{external_port}"

    try:
        mark_running(
            instance_id,
            port=external_port,
            container_id=str(info["container_name"]),
            url=display_url,
        )
    except KeyError:
        mark_error(instance_id, "state missing after deploy")
        raise InstancesError(500, "instance state missing after deploy")

    return {
        "status": "ok",
        "instance_id": instance_id,
        "problem": problem_key,
        "title": title,
        "external_port": external_port,
        "url": display_url,
    }


def stop_instance(*, user: dict, instance_id: int) -> dict:
    # Stop race mitigation:
    # permission check + running->stopping transition is done atomically in store.
    transition, inst = try_mark_stopping(
        instance_id=instance_id,
        requester_username=user.get("username"),
        requester_role=user.get("role"),
    )
    if transition == "not_found":
        raise InstancesError(404, "instance not found")
    if transition == "forbidden":
        raise InstancesError(403, "Forbidden")
    if transition == "missing_container":
        mark_error(instance_id, "container name missing in state")
        raise InstancesError(500, "container name missing in state")
    if transition in {"already_stopping", "not_running"}:
        return {"status": "ok", "instance_id": instance_id, "detail": transition}
    if transition != "ready" or not isinstance(inst, dict):
        raise InstancesError(500, "invalid stop transition state")

    container_name = str(inst.get("container"))
    result = _stop_container(container_name)
    if result.get("status") == "ok" or _container_already_removed(result):
        remove_instance(instance_id)
        return {"status": "ok", "instance_id": instance_id, "container": container_name}

    mark_error(instance_id, result.get("error", "stop failed"))
    raise InstancesError(500, result.get("error", "stop failed"))


def list_instances(*, user: dict) -> list[dict]:
    instances_out: list[dict] = []
    for inst in list_instances_snapshot():
        if user.get("role") != "admin" and inst.get("owner") != user.get("username"):
            continue

        row = {
            "instance_id": inst.get("instance_id"),
            "problem": inst.get("problem"),
            "title": inst.get("title"),
            "status": inst.get("status"),
            "port": inst.get("port"),
            "url": inst.get("url"),
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


__all__ = ["InstancesError", "start_instance", "stop_instance", "list_instances"]
