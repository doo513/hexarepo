from fastapi import APIRouter, HTTPException, Request

from ...auth import auth
from ...auth.deps import get_optional_user
from ..settings_service import is_ranking_visible

router = APIRouter()


def _ensure_ranking_visible(request: Request) -> dict | None:
    user = get_optional_user(request)
    visible, info = is_ranking_visible(user)
    if visible:
        return user

    raise HTTPException(
        status_code=403,
        detail=str(info.get("closed_message") or "This page has been closed."),
    )


@router.get("/api/scoreboard")
def scoreboard(request: Request):
    _ensure_ranking_visible(request)
    rows = auth.get_scoreboard()
    return {"status": "ok", "scoreboard": rows}


@router.get("/api/scoreboard/summary")
def scoreboard_summary(request: Request):
    _ensure_ranking_visible(request)
    rows = auth.get_scoreboard(limit=100000)
    summary = auth.get_scoreboard_summary()
    return {
        "status": "ok",
        "summary": {
            "total_participants": summary.get("total_players", len(rows)),
            "total_score": sum(int(row.get("score") or 0) for row in rows),
            "total_solves": summary.get("total_solves", sum(int(row.get("solved_count") or 0) for row in rows)),
            "leader": rows[0] if rows else None,
            "top_3": summary.get("top_users", rows[:3]),
        },
    }


@router.get("/api/scoreboard/timeline")
def scoreboard_timeline(request: Request, hours: int | None = None, limit: int = 10, full: bool = False):
    _ensure_ranking_visible(request)
    return {
        "status": "ok",
        "timeline": auth.get_scoreboard_timeline(hours=None if full else hours, limit=limit),
    }


@router.get("/api/scoreboard/{username}")
def scoreboard_user_detail(username: str, request: Request):
    _ensure_ranking_visible(request)
    rows = auth.get_scoreboard(limit=100000)
    username_norm = (username or "").strip().lower()
    entry = next((row for row in rows if str(row.get("username") or "").strip().lower() == username_norm), None)
    if not entry:
        raise HTTPException(status_code=404, detail="user not found on scoreboard")

    user = auth.get_user(username_norm)
    solved = user.get("solved_problems") if isinstance(user, dict) else []
    if not isinstance(solved, list):
        solved = []
    return {
        "status": "ok",
        "entry": entry,
        "details": {
            "total_participants": len(rows),
            "solved_problems": solved,
        },
    }


__all__ = ["router"]
