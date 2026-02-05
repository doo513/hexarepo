from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
import os

from . import auth
from . import models
from . import token
from .deps import get_current_user

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


@router.post("/api/auth/register")
def register(req: models.RegisterRequest, request: Request):
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
        "access_token": token_value,
        "token_type": "bearer",
        "user": auth.public_user(user)
    }
    resp = JSONResponse(body)
    _set_auth_cookie(resp, request, token_value)
    return resp


@router.post("/api/auth/login")
def login(req: models.LoginRequest, request: Request):
    user = auth.authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token_value = token.create_access_token(user["username"], user["role"])
    body = {
        "status": "ok",
        "access_token": token_value,
        "token_type": "bearer",
        "user": auth.public_user(user)
    }
    resp = JSONResponse(body)
    _set_auth_cookie(resp, request, token_value)
    return resp


@router.get("/api/auth/me")
def me(request: Request):
    user = get_current_user(request)
    return {
        "status": "ok",
        "user": auth.public_user(user)
    }


@router.post("/api/auth/logout")
def logout():
    resp = JSONResponse({"status": "ok"})
    resp.delete_cookie(key="hexactf_token", path="/")
    return resp
