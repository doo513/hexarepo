from fastapi import APIRouter
from fastapi.responses import HTMLResponse
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.dirname(BASE_DIR)
ROOT_DIR = os.path.dirname(API_DIR)
PAGES_DIR = os.path.join(ROOT_DIR, "static", "pages")

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


@router.get("/scoreboard")
def scoreboard_page():
    return HTMLResponse(_read_page("scoreboard.html"))


@router.get("/admin")
def admin_page():
    return HTMLResponse(_read_page("admin.html"))

