from __future__ import annotations

import os
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request

from ...core import models
from ...auth.deps import get_current_user, get_optional_user, require_csrf
from ..instances_service import InstancesError, list_instances, start_instance, stop_instance
from ..settings_service import is_challenges_visible

router = APIRouter()


def _normalize_base_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = "http://{}".format(raw)
    parsed = urlparse(raw)
    host = parsed.hostname
    scheme = (parsed.scheme or "http").strip()
    if host:
        return "{}://{}".format(scheme, host)
    return raw.rstrip("/")


def _server_base_url(request: Request) -> str:
    forced = _normalize_base_url(os.environ.get("HOST_URL") or os.environ.get("HEXACTF_INSTANCE_BASE_URL") or "")
    if forced:
        return forced
    host_ip = os.environ.get("HOST_IP") or ""
    if host_ip:
        return _normalize_base_url(host_ip)
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    host = (forwarded_host or request.url.hostname or "localhost").split(",")[0].strip()
    host = host.split(":")[0]
    scheme = (forwarded_proto or request.url.scheme or "http").split(",")[0].strip().lower()
    if scheme == "https":
        scheme = "http"
    return "{}://{}".format(scheme, host)


@router.post("/start")
def start(req: models.StartRequest, request: Request):
    user = get_current_user(request)
    require_csrf(request)
    if user.get("role") != "admin":
        visible, info = is_challenges_visible(user)
        if not visible:
            raise HTTPException(status_code=403, detail="Challenges are currently closed")
    try:
        result = start_instance(user=user, problem_key=req.problem)
    except InstancesError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    url = result.get("url") or "{}:{}".format(_server_base_url(request), result["external_port"])
    return {
        "status": "ok",
        "instance_id": result["instance_id"],
        "problem": result["problem"],
        "title": result["title"],
        "access_mode": result.get("access_mode"),
        "url": url,
    }


@router.post("/stop/{instance_id}")
def stop(instance_id: int, request: Request):
    user = get_current_user(request)
    require_csrf(request)
    try:
        return stop_instance(user=user, instance_id=instance_id)
    except InstancesError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.get("/api/instances")
def list_instances_route(request: Request):
    user = get_current_user(request)
    base = _server_base_url(request)
    rows = []
    for inst in list_instances(user=user):
        port = inst.get("port")
        url = inst.get("url") or ("{}:{}".format(base, port) if port else None)
        row = {
            "instance_id": inst.get("instance_id"),
            "problem": inst.get("problem"),
            "title": inst.get("title"),
            "status": inst.get("status"),
            "access_mode": inst.get("access_mode"),
            "url": url,
        }
        if user.get("role") == "admin":
            row["owner"] = inst.get("owner")
        rows.append(row)

    return {"status": "ok", "instances": rows}


__all__ = ["router"]
