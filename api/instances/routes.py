from fastapi import APIRouter, HTTPException, Request

from .. import models
from ..auth.deps import get_current_user, require_csrf
from .errors import InstancesError
from .service import list_instances as list_instances_service
from .service import start_instance as start_instance_service
from .service import stop_instance as stop_instance_service

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
    require_csrf(request)
    try:
        result = start_instance_service(user=user, problem_key=req.problem)
    except InstancesError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    url = f"{_server_base_url(request)}:{result['external_port']}"
    return {
        "status": "ok",
        "instance_id": result["instance_id"],
        "problem": result["problem"],
        "title": result["title"],
        "url": url,
    }


@router.post("/stop/{instance_id}")
def stop(instance_id: int, request: Request):
    user = get_current_user(request)
    require_csrf(request)
    try:
        return stop_instance_service(user=user, instance_id=instance_id)
    except InstancesError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.get("/api/instances")
def list_instances(request: Request):
    user = get_current_user(request)
    base = _server_base_url(request)
    rows = []
    for inst in list_instances_service(user=user):
        port = inst.get("port")
        url = f"{base}:{port}" if port else None
        row = {
            "instance_id": inst.get("instance_id"),
            "problem": inst.get("problem"),
            "title": inst.get("title"),
            "status": inst.get("status"),
            "url": url,
        }
        if user.get("role") == "admin":
            row["owner"] = inst.get("owner")
        rows.append(row)

    return {"status": "ok", "instances": rows}
