---
date: 2026-11-20
status: accepted
tags: [decision]
---
# Cashier portal reusing staff shell and RBAC
- Decision: Map `Role.CASHIER` to `"CASHIER"` in `/api/auth/session/`, add a dedicated Cashier Portal at `/cashier` (`web/cashier.html`, `web/cashier.js`) backed by `GET /api/staff/cashier/overview/` and `POST /api/staff/payments/`, enforce server-side page guards in `profit/views.py`, and restrict shared Staff Portal navigation and actions to Cashier-authorized areas.
- Reason: Cashiers previously mapped to `"ADMIN"` in `WEB_ROLE`, exposing Owner-only pages (`/reports`, `/trainers`, `/announcements`) in navigation, while `auth.js` clean-URL matching failed to drop leading slashes. Separating `"CASHIER"` at both session and Django view layers while reusing `dashboard.css`, `finance-ui.css`, `layout.js`, and existing `ManualPayment` / `record_desk_payment` APIs keeps the identical visual system without duplicating models or payment logic.
- Trade-offs: Adding `GET /api/staff/cashier/overview/` adds one lightweight read endpoint; authenticated HTML shells rely on server-side `HttpResponseForbidden` (`403`) on `web_page` plus API-level DRF permissions (`CanManageEnrollment` vs `CanViewFinancials`), while anonymous GETs still serve the HTML shell for `auth.js` session redirects.
- Evidence: Modified `api/auth.py`, `api/staff.py`, `api/urls.py`, `profit/views.py`, `web/login.html`, `web/auth.js`, `web/layout.js`, `web/sidebar.js`, `web/finance-ui.css`, `web/pages.js`, `web/settings.js`, `apps/accounts/tests/test_web_session.py`, `apps/finance/tests/test_payments_api.py`; created `web/cashier.html`, `web/cashier.js`. Verified with `python manage.py check` (0 errors, pre-existing `staticfiles.W004` warning) and `python manage.py test` (239 tests, 239 OK).

## Related
- [[2026-10-07 Membership API isolates each member]]
- [[2026-11-20 Clean extensionless URLs for web pages]]
- [[Unknown Desk payments live in ManualPayment]]
