# Phase 11 — one bundle: portal UI, sidebar/logo, load animation, health form, editable payment history

Replaces portal-ui.css from phases 10, 10b and 10c (their fixes are included here).

## Files
- web/portal-ui.css (new, full): sidebar offset on desktop, centred logo in the collapsed sidebar, member portal redesign, health & goals form layout, staff polish, payment edit modal.
- web/portal-fx.js (new): top progress bar, scroll reveal, smooth page-to-page fade.
- web/splash.js: new intro (glow, double ring, letter rise, loading bar, curtain opens). Once per tab session. Now also on join.html.
- web/payments.html, web/pages.js, web/data.js: "Payment history" tab with search and an Edit button (desk payments).
- api/staff.py, api/serializers.py, api/urls.py: PATCH /api/staff/payments/<id>/ (Owner only; method and paid_on only).
- apps/finance/tests/test_payment_edit.py: tests for the edit endpoint.
- web/*.html: link portal-ui.css and portal-fx.js. web/sw.js: cache v4.

No migration needed.
