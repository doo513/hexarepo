from __future__ import annotations

from ..auto_api import auto_deploy, auto_stop


def deploy(problem_dir: str, instance_id: int, port: int | None = None) -> dict:
    return auto_deploy.deploy(problem_dir, instance_id, port=port)


def stop_container(container_name: str) -> dict:
    return auto_stop.stop_container(container_name)

