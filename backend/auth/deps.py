from fastapi import HTTPException, Request

from . import auth
from ..core import token


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
    current_nonce = str(user.get("session_nonce") or "")
    token_nonce = str(payload.get("sn") or "")
    if current_nonce and token_nonce and current_nonce != token_nonce:
        raise HTTPException(status_code=401, detail="다른 기기 또는 브라우저에서 다시 로그인되어 현재 세션이 종료되었습니다.")
    if str(user.get("status") or "approved") != "approved":
        raise HTTPException(status_code=403, detail="관리자 승인 대기 중입니다.")
    auth.touch_user_activity(str(user.get("username") or username))
    refreshed = auth.get_user(username)
    if refreshed:
        return refreshed
    return user


def get_optional_user(request: Request) -> dict | None:
    auth_header = request.headers.get("authorization") or ""
    token_value = ""
    if auth_header.lower().startswith("bearer "):
        token_value = auth_header.split(" ", 1)[1].strip()
    else:
        token_value = request.cookies.get("hexactf_token") or ""
    if not token_value:
        return None

    ok, payload = token.verify_token(token_value)
    if not ok:
        return None
    username = payload.get("sub")
    if not username:
        return None
    user = auth.get_user(username)
    if not user:
        return None
    current_nonce = str(user.get("session_nonce") or "")
    token_nonce = str(payload.get("sn") or "")
    if current_nonce and token_nonce and current_nonce != token_nonce:
        return None
    if str(user.get("status") or "approved") != "approved":
        return None
    auth.touch_user_activity(str(user.get("username") or username))
    return auth.get_user(username) or user


def get_admin_user(request: Request) -> dict:
    user = get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
