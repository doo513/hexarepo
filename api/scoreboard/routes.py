from fastapi import APIRouter

from ..auth.auth import get_scoreboard

router = APIRouter()


@router.get("/api/scoreboard")
def scoreboard():
    rows = get_scoreboard()
    return {"status": "ok", "scoreboard": rows}

