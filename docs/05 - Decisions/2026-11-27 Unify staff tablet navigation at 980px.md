---
date: 2026-11-27
status: accepted
tags: [decision]
---
# Unify staff tablet navigation at 980px
- Decision: Hide the fixed Owner/Cashier desktop icon-rail sidebar (`nav.sidebar#sidebar`) and clear `.main-content`'s `80px` left offset at `max-width: 980px` in `web/pf-system.css`, so portrait tablets (`769px`–`980px`) and phones use the bottom tab bar + More sheet exclusively while desktop (`>= 981px`) uses the sidebar rail.
- Reason: `.pf-mob-tabs` appeared at `<= 980px` while `nav.sidebar#sidebar` only hid at `<= 768px`, causing both navigation bars to appear together on portrait tablets (`820px` iPad Air) with the sidebar overlapping the `Home` tab. Matching the `980px` breakpoint aligns Owner/Cashier navigation with the Trainer portal.
- Trade-offs: Portrait tablets (`769px`–`980px`) use the bottom tab bar instead of the hover-expand desktop rail, which fits touch devices better but keeps secondary Owner links inside the `More` sheet.
- Evidence: `web/pf-system.css`, `web/auth.js`, `web/settings.js`, `web/global.css`, `web/profile.html`, `web/payments.html`, `web/reports.html`, `web/trainer/trainer.css`; 156-check Playwright audit across `360px`/`390px`/`768px`/`820px`/`1024px`/`1440px` for Owner, Cashier, and Trainer returned 0 issues; `python manage.py check` and 30 targeted Django tests (`test_installable`, `test_permissions`, `tests_trainer_qr`) passed.

## Related
- [[2026-11-26 Shared pf-system stylesheet for cross-portal UI]]
- [[2026-11-26 Enforce strict portal RBAC and unified dashboard URL]]
