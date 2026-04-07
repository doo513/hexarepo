# HexaCTF Backend Notes

## Entry and App Assembly
- backend/app.py re-exports app from backend.main.
- backend/main/__init__.py mounts /static, ensures default admin on startup, and registers routers.

## Key Backend Areas
### Auth
- backend/auth/auth.py: user storage, password hashing/verification, admin bootstrap, auth helpers
- backend/auth/deps.py: auth dependency helpers
- backend/auth/routes_auth.py: login/register/logout/current user
- backend/auth/routes_admin.py: admin user and settings operations

### Core
- backend/core/config.py: path constants for runtime files and static assets
- backend/core/models.py: shared data models
- backend/core/storage_utils.py: file locking and atomic persistence helpers
- backend/core/token.py: token and session helpers

### Main Services
- backend/main/instances_service.py and instance_store.py: instance lifecycle/state handling
- backend/main/settings_service.py and settings_store.py: persisted settings management
- backend/main/routes/: public API/page route handlers

## Safety Notes
- Runtime JSON files in data/ and root state files should be treated as live state, not cleanup targets.
- Cleanup should avoid changing import paths inside backend/ unless functionality is being intentionally refactored.
