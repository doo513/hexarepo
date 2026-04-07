# HexaCTF Architecture

## Purpose
HexaCTF is a lightweight CTF platform with a FastAPI backend and a static frontend. It provides challenge listing, flag submission, scoreboard tracking, and per-user challenge instances.

## Runtime Layout
- backend/: live FastAPI server code
- static/: live frontend assets and pages
- data/: runtime user/settings/secret data
- challenges.json: challenge catalog
- instances.json: instance state store

## Backend Module Map
- backend/app.py: app entrypoint re-export
- backend/main/__init__.py: FastAPI creation, static mount, router registration
- backend/auth/: login, register, logout, admin endpoints, auth dependencies
- backend/container/: container deploy/stop helpers
- backend/core/: shared config, models, storage helpers, token logic
- backend/main/: instance/settings services and public routes

## Data Flow
1. Browser requests HTML pages or JS from FastAPI static mount.
2. Frontend JS calls auth/challenge/instance/scoreboard endpoints.
3. Auth state is cookie-based with token/CSRF handling.
4. Challenge and instance data are persisted in JSON files with storage helpers.

## Cleanup Notes
- backend/ and static/ are the live code paths.
- Old backup/cache artifacts are not part of runtime architecture.
