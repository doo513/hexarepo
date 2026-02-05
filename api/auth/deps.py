from fastapi import HTTPException, Request

from . import auth
from .. import token


def _has_bearer_auth(request: Request) -> bool:
    auth_header = request.headers.get("authorization") or ""
    return auth_header.lower().startswith("bearer ")


def require_csrf(request: Request) -> None:
    if request.method.upper() in {"GET", "HEAD", "OPTIONS"}:
        return
    # If the caller uses Bearer tokens, CSRF doesn't apply.
    if _has_bearer_auth(request):
        return
    # Cookie-based auth must present a matching CSRF header.
    if request.cookies.get("hexactf_token"):
        csrf_cookie = request.cookies.get("hexactf_csrf") or ""
        csrf_header = request.headers.get("x-csrf-token") or ""
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            raise HTTPException(status_code=403, detail="CSRF token missing or invalid")


def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("authorization") or ""
    token_value = ""
    if auth_header.lower().startswith("bearer "):
        token_value = auth_header.split(" ", 1)[1].strip()
    else:
        token_value = request.cookies.get("hexactf_token") or ""
    if not token_value:
        raise HTTPException(status_code=401, detail="Authorization required")
    ok, payload = token.verify_token(token_value)
    if not ok:
        raise HTTPException(status_code=401, detail=payload.get("error", "Invalid token"))
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = auth.get_user(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_admin_user(request: Request) -> dict:
    user = get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
