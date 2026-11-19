---
date: 2026-11-08
status: accepted
tags: [decision]
---
# Daily plan added at PHP 80
- Decision: Add a `daily` plan at ₱80 (8,000 centavos, 1 day) in the two backend constants, the two frontend plan lists and the join page's plan grid (3 → 4 columns).
- Reason: Plan definitions are single-sourced in `PLAN_PRICE_CENTAVOS` and `PLAN_DAYS` on the backend and in `web/data.js` / `web/member-pay.js` on the frontend, so adding a key means touching all four plus static HTML.
- Trade-offs: Not stated in log
- Evidence: `apps/finance/services.py`, `apps/membership/services.py`, `web/data.js`, `web/member-pay.js`, `web/join.html`; Source: PROJECT-LOG.md, 2026-11-08 12:38.

## Related
- None
