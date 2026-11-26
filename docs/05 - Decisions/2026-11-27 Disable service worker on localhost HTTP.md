---
date: 2026-11-27
status: accepted
tags: [decision]
---
# Disable service worker on localhost HTTP
- Decision: Restrict Service Worker registration (`web/api.js`, `web/site-footer.js`) to HTTPS only, make `web/sw.js` bypass `fetch` and self-unregister/clear caches when loaded over local HTTP (`localhost`, `127.0.0.1`, `[::1]`), guard against Chromium's `only-if-cached` navigation error, and serve `/sw.js` with `Cache-Control: no-cache, must-revalidate` in `profit/middleware.py`.
- Reason: Registering `web/sw.js` on `http://127.0.0.1:8000` and `http://localhost:8000` caused the browser's installed Service Worker to hijack local page navigations with the `Offline Mode` fallback screen (whenever `runserver` was restarted/unreachable or Chromium threw on `only-if-cached` reloads) and serve stale cached JS/CSS during local development. Keeping offline SW caching strictly on HTTPS preserves production offline mode while making localhost self-healing.
- Trade-offs: Testing offline Service Worker caching locally now requires an HTTPS tunnel or preview deploy rather than plain HTTP `127.0.0.1:8000`; production HTTPS offline mode and per-user `localStorage` API read caching remain unchanged.
- Evidence: `web/sw.js`, `web/api.js`, `web/site-footer.js`, `profit/middleware.py`, `profit/tests/test_installable.py`, and `?v=` bumps across 29 `web/**/*.html` files; verified JS syntax with Node `--check`, `python manage.py check` (0 errors; pre-existing `staticfiles.W004`), and `python manage.py test profit.tests` (36/36 OK against SQLite; `ruff` not installed in environment).

## Related
- [[2026-11-27 Safe offline read mode with auto-refresh and logout wipe]]
- [[2026-11-26 Enforce strict portal RBAC and unified dashboard URL]]
