---
date: 2026-11-20
status: accepted
tags: [decision]
---
# Clean extensionless URLs for web pages
- Decision: Serve the static web/ pages at extensionless URLs (`/login`, `/members`, `/trainer/index`) via two catch-all routes placed last in `profit/urls.py`; rewrite all internal links to drop `.html` and point the landing links at `/`.
- Reason: The owner wants no `.html` in the address bar and the landing page to load at the bare domain; `/` already serves welcome.html, so only the links and routes needed changing.
- Trade-offs: The catch-all serves any existing `web/<slug>.html`, so a future file added there is reachable at `/<slug>`; WhiteNoise still serves the original .html paths, so old bookmarks still work.
- Evidence: `profit/urls.py`, `profit/views.py`, 230 links rewritten across `web/`, `web/google-auth.js`, `web/site-footer.js`, `web/splash.js`, `web/legal.css`, `profit/tests/test_clean_urls.py` (6 tests); `manage.py check` clean, 230 tests OK.

## Related
- [[2026-11-16 Installable web app, no service worker]]
