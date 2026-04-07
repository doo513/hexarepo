# HexaCTF API Reference

## Main Route Groups
- Auth: register, login, logout, current user, admin actions
- Challenges: list challenges, submit flags, download files
- Instances: start/stop/list per-user challenge instances
- Scoreboard: public ranking data
- Pages: HTML entry pages

## Auth Behavior
- Session/auth uses HttpOnly cookie flow with CSRF protection for cookie-based requests.
- Admin endpoints are separated from normal auth endpoints.

## Challenge/Instance Behavior
- Challenges are sourced from challenges.json.
- Instance limits are enforced per user, with admin override support.
- Instance state is persisted in instances.json.

## Important Integration Points
- Frontend JS under static/js/ is the main consumer of these endpoints.
- Backend services under backend/main/ and auth helpers under backend/auth/ own the core business logic.
