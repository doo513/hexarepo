from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os

from .auth.auth import ensure_default_admin
from .auth.routes_admin import router as admin_router
from .auth.routes_auth import router as auth_router
from .challenges.routes import router as challenges_router
from .instances.routes import router as instances_router
from .pages.routes import router as pages_router
from .scoreboard.routes import router as scoreboard_router

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
STATIC_DIR = os.path.join(ROOT_DIR, "static")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def ensure_admin_user():
    ensure_default_admin()


app.include_router(pages_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(challenges_router)
app.include_router(instances_router)
app.include_router(scoreboard_router)
