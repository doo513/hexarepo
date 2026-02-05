from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os

from . import auth
from .routes_admin import router as admin_router
from .routes_auth import router as auth_router
from .routes_challenges import router as challenges_router
from .routes_instances import router as instances_router
from .routes_pages import router as pages_router
from .routes_scoreboard import router as scoreboard_router

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
STATIC_DIR = os.path.join(ROOT_DIR, "static")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def ensure_admin_user():
    auth.ensure_default_admin()


app.include_router(pages_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(challenges_router)
app.include_router(instances_router)
app.include_router(scoreboard_router)
