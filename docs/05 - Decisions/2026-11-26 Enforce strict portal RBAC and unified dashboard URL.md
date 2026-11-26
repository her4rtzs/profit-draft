---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Enforce strict portal RBAC and unified dashboard URL
- Decision: Subclass WhiteNoise (`ProtectedWhiteNoiseMiddleware` overriding `__call__`) so raw `.html` requests never bypass Django middleware/views, enforce strict per-role isolation across all web portals in `profit/views.py` and `web/auth.js`, redirect unauthenticated portal visitors to `/login?next=...`, and unify every role's main workspace under `/dashboard` (`role_home_url`).
- Reason: Previously, `WHITENOISE_ROOT` served raw `.html` files directly without checking the user's session or role, and several top-level/grouped extensionless pages returned `200` when unauthenticated or allowed cross-role access (such as Owner opening `/cashier` or `/trainer/index`). Putting all HTML pages through Django RBAC and dispatching `/dashboard` by server-verified role ensures nobody can open any portal without logging in with the matching role.
- Trade-offs: HTML pages no longer stream straight out of WhiteNoise in Django's middleware layer, and legacy home URLs (`/index`, `/cashier`, `/trainer/index`, `/member-home`) redirect to `/dashboard` for the owning role (returning `403` to other roles) while remaining usable in URL resolution tests.
- Evidence: `profit/middleware.py`, `profit/settings.py`, `profit/urls.py`, `profit/views.py`, `apps/accounts/services.py`, `api/auth.py`, `web/auth.js`, `web/layout.js`, `web/assets/js/staff.js`, `web/trainer/index.html`, `profit/tests/test_portal_rbac.py` (`profit.tests`: 24/24 passed).

## Related
- [[2026-11-20 Clean extensionless URLs for web pages]]
- [[2026-11-20 Cashier portal reusing staff shell and RBAC]]
- [[2026-11-26 Linked Google login and first-login gate]]
