from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from ..auth.auth import ensure_default_admin
from ..auth.routes_admin import router as admin_router
from ..auth.routes_auth import router as auth_router
from .routes.challenges import router as challenges_router
from .routes.instances import router as instances_router
from .routes.pages import router as pages_router
from .routes.scoreboard import router as scoreboard_router
from ..core.config import STATIC_DIR

app = FastAPI()

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
