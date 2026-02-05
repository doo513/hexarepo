from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
import os
import secrets

from . import auth
from .. import models
from .. import token
from .deps import get_current_user, require_csrf

router = APIRouter()

def _cookie_secure(request: Request) -> bool:
    forced = (os.environ.get("HEXACTF_COOKIE_SECURE") or "").strip().lower()
    if forced in {"1", "true", "yes"}:
        return True
    if forced in {"0", "false", "no"}:
        return False

    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = (forwarded_proto or request.url.scheme or "http").split(",")[0].strip().lower()
    return scheme == "https"

def _server_base_url(request: Request) -> str:
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    host = (forwarded_host or request.url.hostname or "localhost").split(",")[0].strip()
    scheme = (forwarded_proto or request.url.scheme or "http").split(",")[0].strip()
    port = request.url.port
    if port and str(port) not in {"80", "443"} and ":" not in host:
        host = f"{host}:{port}"
    return f"{scheme}://{host}"


def require_same_origin(request: Request) -> None:
    origin = (request.headers.get("origin") or "").strip()
    referer = (request.headers.get("referer") or "").strip()
    # Non-browser clients (curl) often omit these; allow.
    if not origin and not referer:
        return

    expected = _server_base_url(request)
    if origin and origin != expected:
        raise HTTPException(status_code=403, detail="Origin not allowed")
    if not origin and referer and not referer.startswith(expected + "/"):
        raise HTTPException(status_code=403, detail="Origin not allowed")


def _set_auth_cookie(resp: JSONResponse, request: Request, token_value: str) -> None:
    resp.set_cookie(
        key="hexactf_token",
        value=token_value,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(request),
        max_age=token.DEFAULT_TTL,
        path="/",
    )

def _set_csrf_cookie(resp: JSONResponse, request: Request, csrf_value: str) -> None:
    resp.set_cookie(
        key="hexactf_csrf",
        value=csrf_value,
        httponly=False,
        samesite="lax",
        secure=_cookie_secure(request),
        max_age=token.DEFAULT_TTL,
        path="/",
    )


def _return_access_token_in_body() -> bool:
    raw = (os.environ.get("HEXACTF_RETURN_ACCESS_TOKEN") or "1").strip().lower()
    return raw not in {"0", "false", "no"}


@router.post("/api/auth/register")
def register(req: models.RegisterRequest, request: Request):
    require_same_origin(request)
    try:
        user = auth.create_user(
            username=req.username,
            password=req.password,
            display_name=req.display_name,
            role="user"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    token_value = token.create_access_token(user["username"], user["role"])
    body = {
        "status": "ok",
        "token_type": "bearer",
        "user": auth.public_user(user)
    }
    if _return_access_token_in_body():
        body["access_token"] = token_value
    resp = JSONResponse(body)
    _set_auth_cookie(resp, request, token_value)
    _set_csrf_cookie(resp, request, secrets.token_hex(16))
    return resp


@router.post("/api/auth/login")
def login(req: models.LoginRequest, request: Request):
    require_same_origin(request)
    user = auth.authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token_value = token.create_access_token(user["username"], user["role"])
    body = {
        "status": "ok",
        "token_type": "bearer",
        "user": auth.public_user(user)
    }
    if _return_access_token_in_body():
        body["access_token"] = token_value
    resp = JSONResponse(body)
    _set_auth_cookie(resp, request, token_value)
    _set_csrf_cookie(resp, request, secrets.token_hex(16))
    return resp


@router.get("/api/auth/me")
def me(request: Request):
    user = get_current_user(request)
    body = {
        "status": "ok",
        "user": auth.public_user(user)
    }
    resp = JSONResponse(body)
    if request.cookies.get("hexactf_token") and not request.cookies.get("hexactf_csrf"):
        _set_csrf_cookie(resp, request, secrets.token_hex(16))
    return resp


@router.post("/api/auth/logout")
def logout(request: Request):
    require_csrf(request)
    resp = JSONResponse({"status": "ok"})
    resp.delete_cookie(key="hexactf_token", path="/")
    resp.delete_cookie(key="hexactf_csrf", path="/")
    return resp
