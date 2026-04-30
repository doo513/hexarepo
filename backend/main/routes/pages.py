import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from ...auth.deps import get_admin_user
from ...core.config import PAGES_DIR

router = APIRouter()


def _read_page(filename: str) -> str:
    path = os.path.join(PAGES_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return f.read()


@router.get("/")
def login_page():
    return HTMLResponse(_read_page("login.html"))


@router.get("/login")
def login_alias():
    return HTMLResponse(_read_page("login.html"))


@router.get("/challenges")
def challenges_page():
    return HTMLResponse(_read_page("challenges.html"))


@router.get("/challenges/{problem_key}")
def challenge_detail_page(problem_key: str):
    # Keep server-side routing compatible with detail-page deep links.
    _ = problem_key
    return HTMLResponse(_read_page("challenges.html"))


@router.get("/scoreboard")
def scoreboard_page():
    return HTMLResponse(_read_page("scoreboard.html"))


@router.get("/admin")
def admin_page(request: Request):
    try:
        get_admin_user(request)
    except HTTPException:
        return RedirectResponse(url="/login", status_code=303)
    return HTMLResponse(_read_page("admin.html"))


__all__ = ["router"]
