# GitHub Copilot / AI Agent Instructions for hexactf 🔧

## Purpose
Short, actionable instructions to help an AI coding agent become productive quickly in this repository.

## Quick overview
- This is a small CTF instance manager that launches challenge containers and exposes links in a web UI.
- Key components: `auto_api/` (FastAPI backend), `static/` (frontend), `challenges/` (problem folders), `instances.json` (runtime state).

## How to run locally (manual)
- Ensure Docker and `lsof` are available on the host.
- Install minimal Python deps: `pip install fastapi uvicorn pydantic` (no requirements.txt currently).
- Start server: `uvicorn auto_api.api:app --reload --host 0.0.0.0 --port 8000`
- Open the UI: `http://localhost:8000`

## Important API endpoints (see `auto_api/api.py`) 🔗
- POST `/api/start` — body: `{ "problem": "<problem_key>" }` → creates an instance in background and returns `instance_id`.
- POST `/api/stop/{instance_id}` — stops and removes a running instance.
- GET `/api/instances` — returns `state.instances` from `instances.json`.
- GET `/api/status/{instance_id}` — returns status for a single instance.

Note: The frontend (`static/app.js`) expects a `/api/challenges` endpoint. No such endpoint currently exists in the backend — see "Mismatches / TODOs" below.

## Data files & formats
- `instances.json` — stores `{ "next_instance_id": <n>, "instances": { ... } }`. New instances are stored under `instances["<id>"]` with keys like `status`, `container`, `port`, `url`.
- `challenges.json` — current format in repo is a simple mapping (see file top-level), but the frontend *expects* a `challenges` mapping with `title/desc/tags/path` entries or the backend to expose a normalized `/api/challenges` response. `auto_api/api.py`'s `start` handler searches for a `problems` list inside category objects — this is a mismatch to reconcile.

## Key implementation details & conventions (points an AI should know) ⚠️
- Docker image name: derived as the problem folder basename (lowercased). See `auto_api/auto_deploy.py`.
- Build context must be the *problem folder* (critical). The deploy code runs: `docker build -t <image> <problem_dir>`.
- Internal port: parsed from `EXPOSE` in the problem `Dockerfile` (fallback 5000).
- External port: randomly picked between 30000–40000 using `lsof` to check availability.
- Container naming: `{image}_{instance_id}`.
- The backend sets `url` to a hard-coded host IP: `http://192.168.0.163:<port>` inside `deploy_bg` — this is environment-specific and should be replaced with a configurable `HOST_URL` or derived host IP.
- All instance state is stored by writing `instances.json` without file locking; concurrent requests may collide (consider locking or atomic updates if you add concurrency-heavy features).

## Environment & external dependencies
- Docker is required to build and run challenge containers.
- `lsof` is required (used to probe port availability).
- No `requirements.txt` or tests currently — creating them would be a high-impact change.

## Observed mismatches & high-impact TODOs (good first tasks) ✅
- Implement `/api/challenges` to return a normalized list the frontend expects (or change frontend to match `challenges.json`). Example: add GET `/api/challenges` that returns `{ "challenges": { "pwn1": { "title": "...", "desc": "...", "path": "challenges/pwn1", "tags": [] } } }`.
- Align `challenges.json` shape with code expectations (either change the file or modify `auto_api/api.py` to support current schema).
- Make host URL configurable (use env var like `HOST_URL`) instead of `192.168.0.163`.
- Add a `requirements.txt` and basic dev instructions in `README.md` (dependencies & run commands).

## Debugging tips
- To inspect container logs: `docker logs <container_name>`.
- To remove a stuck container: `docker rm -f <container_name>`.
- Check port collisions: `lsof -i :<port>`.

## Suggested tests & CI checks
- Unit tests for `auto_deploy.get_internal_port()` (parses Dockerfile EXPOSE correctly).
- Integration test: POST `/api/start` with a small test Dockerfile to ensure image builds and container runs.

## Short actionable examples (for agents)
- Add `/api/challenges` endpoint: read `challenges.json`, normalize structure, return `{ "challenges": ... }`.
- Replace hard-coded host in `deploy_bg` with `HOST_URL` from env or configuration.
- Add `requirements.txt` with `fastapi, uvicorn, pydantic` and a `Makefile` target `make dev` that runs the server.

---

If anything here is unclear or you want the instructions to emphasize other areas (e.g., testing strategy or adding CI), tell me which sections to expand and I will iterate. 🙏
