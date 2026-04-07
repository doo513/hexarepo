# HexaCTF Frontend Notes

## Structure
- static/pages/: HTML page shells
- static/js/: modular JavaScript by concern
- static/css/: modular styles

## JS Module Roles
- app-main.js: bootstrap and entry behavior
- app-router.js, app-nav.js: page switching and navigation logic
- app-auth.js: login/register/logout and user state handling
- app-challenges.js: challenge rendering, downloads, flag submission, instance actions
- app-scoreboard.js: scoreboard fetching and rendering
- app-admin.js: admin panel interactions
- app-core.js: shared DOM, state, and log helpers

## Frontend/Backend Contract
- Frontend expects stable auth, challenge, instance, and scoreboard endpoints.
- CSS is already modularized in static/css/; future cleanup should prefer that structure over monolithic assets.

## LLM Orientation
For behavior changes, start from static/js/app-core.js plus the feature-specific JS module, then trace to the matching backend route.
