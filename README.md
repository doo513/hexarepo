**HexaCTF**
HexaCTF is a lightweight CTF platform with a FastAPI backend and a static frontend. It supports challenge listing, flag submission, per-user container instances, and an admin console.

**Highlights**
- Auth: register/login/logout, HttpOnly cookie sessions, CSRF for cookie-based requests.
- Users and scoreboard: scoring, solved tracking, public scoreboard API.
- Challenges: list, download files, submit flags, hide server paths in API responses.
- Instances: start/stop per challenge, per-user limits, admin override, state persisted in `instances.json`.
- Admin tools: user list/role management, delete users, reset scoreboard, set instance limit.
- Storage hardening: file locks + atomic writes, PBKDF2 password hashing with legacy upgrade, persistent HMAC secret.

**Layout**
- `backend/` FastAPI app, auth, instance management, settings.
- `static/` HTML/CSS/JS frontend (login, challenges, scoreboard, admin).
- `challenges.json` challenge definitions.
- `data/` runtime data (users, settings, secret).
- `instances.json` runtime instance state.
- `mkdn/fix.md` detailed change log.

**Run**
1. Install deps: `pip install fastapi uvicorn pydantic docker`
1. Start server: `uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload`
1. Open `http://localhost:8000/`

**Challenges**
`challenges.json` is a dict keyed by problem key. Common fields:
- `challenge_id`: external id.
- `title`: display name.
- `dir`: absolute path to the challenge folder (typically under `HexaCTF_Challenges/`).
- `category` or `type`: pwn/web/rev/misc/etc.
- `score`: points.
- `port`: internal container port (optional).
- `access_mode`: public exposure mode override (`http` or `tcp`, optional).
- `container`: set to `false` for non-container challenges.
- `container_dir`: subdir to build/run (optional).
- `downloads`: list of `{label, path}`.
- `flag` or `flag_path`: flag value or file path.
- `flag_mode: "dynamic"`: derive a per-user flag with `data/flag_secret.key`.
- `container_flag_path`: optional absolute path to mount the derived flag read-only inside the container.
- `desc`, `tags`, `locked`: optional UI fields.

**Config**
- `HEXACTF_ADMIN_USERNAME`, `HEXACTF_ADMIN_PASSWORD`
- `HEXACTF_PBKDF2_ITERATIONS`
- `HEXACTF_TOKEN_TTL`
- `HEXACTF_SECRET`
- `HEXACTF_FLAG_SECRET`
- `HEXACTF_FLAG_PREFIX`
- `HEXACTF_FLAG_TOKEN_HEX_LEN`
- `HEXACTF_USER_INSTANCE_LIMIT`
- `HEXACTF_MAX_USER_INSTANCE_LIMIT`
- `HEXACTF_COOKIE_SECURE`
- `HEXACTF_RETURN_ACCESS_TOKEN`
- `HOST_URL` or `HEXACTF_INSTANCE_BASE_URL`
- `HEXACTF_PROXY_URL_TEMPLATE`, `HEXACTF_PROXY_DOMAIN`
- `HOST_IP`
- `HEXACTF_HTTP_PORT_RANGE`, `HEXACTF_TCP_PORT_RANGE`
- `HEXACTF_HTTP_URL_TEMPLATE`, `HEXACTF_TCP_PUBLIC_HOST`, `HEXACTF_TCP_PUBLIC_URL_TEMPLATE`

**GitHub Notes**
- Do not commit runtime data: `data/users.json`, `data/secret.key`, `instances.json`, `*.lock`, `__pycache__/`.
- Avoid publishing real flags. Prefer `flag_path` pointing to files outside the repo or scrub `flag` values before open-sourcing.

**Details**
See `mkdn/fix.md` for the full change log.
