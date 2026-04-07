# HexaCTF Setup Notes

## Run
1. Install Python dependencies required by the FastAPI backend.
2. Start with uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload.
3. Open the served pages in the browser.

## Important Environment and Config Values
- Admin bootstrap credentials
- Token/session TTL and secret
- User instance limit values
- Host/proxy URL values for instance exposure

## Runtime Files
- data/users.json: user database
- data/secret.key: signing secret
- data/settings.json: persisted settings
- instances.json: running instance state

## Operational Guidance
- Do not commit runtime secrets, user data, or lock files.
- Treat _llm_ref/ as reference-only documentation for navigation and understanding.
