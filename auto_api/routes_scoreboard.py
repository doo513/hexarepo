from fastapi import APIRouter

from . import auth

router = APIRouter()


@router.get("/api/scoreboard")
def scoreboard():
    rows = auth.get_scoreboard()
    return {
        "status": "ok",
        "scoreboard": rows
    }
