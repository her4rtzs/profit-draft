---
date: 2026-11-27
status: accepted
tags: [decision]
---
# Safe offline read mode with auto-refresh and logout wipe
- Decision: Supersede the no-service-worker rule by adding a scoped Service Worker (`web/sw.js`) for static assets and visited HTML pages (Network-First, never caching `/api/*`), a per-user `GET` snapshot cache in `web/api.js` that serves saved data while offline and auto-refreshes when internet returns, offline write blocking, and immediate full cache wiping on logout or `401`/`403`.
- Reason: The owner wants all roles (Owner, Cashier, Trainer, Member, and public visitors) to open and browse the site without internet while keeping data synchronized once online. Scoping API snapshots per signed-in user ID, never caching `/api/*` in the Service Worker, keeping writes server-only, and wiping both `localStorage` snapshots and `profit-pages-v1` on logout or session expiry addresses the original shared-device privacy concern.
- Trade-offs: Unvisited pages still require an initial online visit before they are available offline (a branded ProFit offline fallback page is shown otherwise); actions that mutate data (payments, approvals, check-ins, profile edits) require reconnecting to save.
- Evidence: `web/sw.js`, `web/api.js`, `web/auth.js`, `web/site-footer.js`, `web/assets/js/staff.js`, 28 updated `web/**/*.html` cache-busting tags, `profit/tests/test_installable.py`, `ROADMAP.md` (`python manage.py check` 0 errors, `makemigrations --check --dry-run` no changes, `python manage.py test profit.tests` — 35/35 OK).

## Related
- [[2026-11-16 Installable web app, no service worker]]
- [[2026-11-26 Enforce strict portal RBAC and unified dashboard URL]]
