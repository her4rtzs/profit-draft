---
date: 2026-11-14
status: accepted
tags: [decision]
---
# Root URL and synchronous head guard stop the dashboard flash
- Decision: Set `WHITENOISE_INDEX_FILE = False` so `/` reaches `views.home` → `web/welcome.html`; add a synchronous auth guard in protected page heads that hides the page before first paint and redirects to `welcome.html`; run the branded loader only immediately after login on portal pages.
- Reason: WhiteNoise was serving the staff dashboard at `/` before Django could check auth, and waiting for `DOMContentLoaded` plus `/api/auth/session` left a 1–2 second window where unauthenticated visitors saw the dashboard.
- Trade-offs: Critical inline head CSS/JS has to stay on every protected page; the loader is deliberately absent on ordinary portal navigation.
- Evidence: `WHITENOISE_INDEX_FILE = False`, `profit/settings.py`, `profit/views.py:home`, `web/welcome.html`, `web/auth.js`, `web/spotify.css`, `web/pf-modern.css`, `web/splash.js`; Source: PROJECT-LOG.md, 2026-11-14 02:56.

## Related
- None
