# Stitch UI Integration Report - 2026-04-10

## Summary

Applied the newer `stitch_ctf_dashboard (1).zip` direction to HexaCTF, tightened visual parity around shared navigation and icons, and implemented backend-backed challenge detail and scoreboard timeline/summary functionality.

## Changed Files

- `backend/auth/auth.py`
- `backend/main/routes/challenges.py`
- `backend/main/routes/scoreboard.py`
- `backend/core/config.py`
- `.env`
- `static/css/stitch-ui.css`
- `static/js/app-core.js`
- `static/js/app-main.js`
- `static/js/app-challenges.js`
- `static/js/app-scoreboard.js`
- `static/js/app-admin.js`
- `static/pages/challenges.html`
- `static/pages/scoreboard.html`
- `static/pages/admin.html`
- `mkdn/stitch-ui-implementation-report-2026-04-10.md`

## Backend Changes

### Challenge Detail

- Reused the existing `/api/challenges/{problem_key}` endpoint as the live data source for the Stitch challenge-detail modal.
- Expanded challenge payload normalization so the frontend gets:
  - `solve_count`
  - `difficulty`
  - `author`
  - `briefing`
  - `instance_note`
  - `service_path`
- Added safe fallback derivation for missing metadata instead of forcing a breaking `challenges.json` schema change.

### Scoreboard Summary / Timeline

- Added/finished scoreboard summary support through `/api/scoreboard/summary`.
- Added `/api/scoreboard/timeline` backed by solve-history aggregation.
- Persist solve history timestamps in `auth.mark_problem_solved()` via `solve_events` so the ranking trajectory can be data-backed instead of static markup only.

## Frontend Changes

### Shared UI

- Unified top nav, left rail, and icon language around the Stitch reference.
- Added shared detail-modal styling and live detail interaction styles in `static/css/stitch-ui.css`.

### Challenges

- Category chips now use per-category colors.
- Challenge card titles and modal title/score typography were reduced to better match the requested proportions.
- Moved the more advanced challenge interaction into the Stitch-style modal detail flow.
- List cards are now closer to the reference cards and open the detail modal instead of overloading the list with too many controls.
- Added deep-link support for `/challenges/{problem_key}` while keeping the same challenges page shell.

### Scoreboard

- Leaderboard page left-rail category shortcuts were removed so the ranking view only keeps the shared navigation entries.
- Table rendering now explicitly sorts by rank ascending before display.
- Reworked scoreboard rendering so podium cards and chart area are fed by live summary/timeline data.
- Kept the main leaderboard table live against the existing scoreboard API.

### Admin

- Reused existing admin/user and instance APIs to populate summary counts like user count and active sessions.

## Network / Runtime Notes

- Loads `.env` automatically from the repo root so manual `uvicorn` starts pick up the AWS/WireGuard-facing runtime values without requiring shell exports.
- Did **not** change the app-side AWS/WireGuard contract intentionally.
- Kept backend instance URL behavior compatible with the existing `HOST_URL`, `HOST_IP`, and external port-range model.
- Important runtime note: non-interactive SSH sessions on the remote host do not include `~/.local/bin` in `PATH`, even though `~/.local/bin/uvicorn` exists. Because of that, `uvicorn ...` may fail in scripted SSH execution while `python3 -m uvicorn ...` works reliably.

## Known Limitations

- Historical trajectory data only becomes fully accurate from the point `solve_events` starts being recorded. Existing users without prior `solve_events` fall back to a coarse representation.
- Some highly decorative Stitch-only placeholder content remains adapted to real HexaCTF data rather than copied verbatim.

