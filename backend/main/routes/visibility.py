from fastapi import APIRouter
from datetime import UTC, datetime
from ..settings_service import is_challenges_visible, is_ranking_visible

router = APIRouter()


@router.get("/api/visibility")
def get_visibility():
    challenges_visible, challenges_info = is_challenges_visible()
    ranking_visible, ranking_info = is_ranking_visible()
    return {
        "challenges_visible": challenges_visible,
        "challenges_opens_at": challenges_info.get("opens_at"),
        "challenges_closes_at": challenges_info.get("closes_at"),
        "ranking_visible": ranking_visible,
        "ranking_opens_at": ranking_info.get("opens_at"),
        "ranking_closes_at": ranking_info.get("closes_at"),
        "server_time": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
