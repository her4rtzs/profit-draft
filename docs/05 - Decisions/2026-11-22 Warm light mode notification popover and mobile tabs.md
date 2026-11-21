---
date: 2026-11-22
status: accepted
tags: [decision]
---
# Warm light mode notification popover and mobile tabs
- Decision: Apply the prototype's warm cream-and-gold light mode, category-labeled notification popover, and role-aware mobile bottom tab bar + "More" sheet through the shared staff layout (`web/layout.js`, `web/notifications-live.js`, `web/sidebar.js`) and CSS bundles (`web/portal-ui.css`, `web/dashboard.css`, `web/global.css`), while preserving ProFit's original fonts, RBAC rules, and live Django API data.
- Reason: Putting the responsive shell, light-mode tokens, and notification popover in the shared assets updates every staff/owner/cashier page consistently without duplicating mock prototype data or breaking live API endpoints, and fixing legacy dark-mode locks on `payments.html`, `reports.html`, and `announcements.html` ensures light mode works on every route.
- Trade-offs: Because `dashboard.css` and `global.css` are concatenated bundles, the polish block was appended to `portal-ui.css` and synced to both bundles (with cache-busting `?v=` bumps across 12 HTML pages) rather than rebuilding the full concatenation pipeline.
- Evidence: Modified `web/layout.js`, `web/notifications-live.js`, `web/sidebar.js`, `web/portal-ui.css`, `web/dashboard.css`, `web/global.css`, `web/index.html`, `web/payments.html`, `web/reports.html`, `web/announcements.html`, `web/members.html`, and cache-busted 12 staff HTML pages. Verified `python manage.py check` (0 errors) and `python manage.py test` (274/274 OK). `ruff` is not installed on PATH; no Python files were modified.

## Related
- [[2026-11-19 Dashboard CSS loads as one generated bundle]]
- [[2026-11-15 Notifications server-synced, not seeded]]
- [[2026-11-20 Cashier portal reusing staff shell and RBAC]]
