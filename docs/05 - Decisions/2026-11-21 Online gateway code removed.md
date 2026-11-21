---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Online gateway code removed
- Decision: Deleted the PayMongo webhook module and route, the HTTP client and checkout services, `/api/member/checkout/`, the legacy `/api/join/confirm/` check, the `PAYMONGO_*` settings, the related tests and the old checkout JavaScript. No model, table or column was dropped: `Payment`, `Subscription`, `WebhookEvent`, `PendingSignup` and `paymongo_payment_id` remain for history, and old online rows are labelled "paymongo (old)" in reports. No migration was created. No `.env*` file was opened or edited.
- Reason: the payment design is cash and staff-reviewed GCash claims only; keeping dead gateway code and keys would leave an unused external dependency and a misleading endpoint surface.
- Trade-offs: existing payment history stays read-only and its old reference values keep their `paymongo_payment_id` column. The owner must remove the retired keys from local `.env`, Vercel and the PayMongo dashboard themselves. `requirements.txt` had no gateway SDK, so there was no package to remove.
- Evidence: `apps/billing/webhooks.py` and `apps/billing/tests/test_webhook.py` deleted; `apps/billing/services.py` reduced to legacy status helpers; `web/member-pay.js` deleted; routes, settings, README and public copy updated. `python manage.py test` passed 261 tests.

## Related
- [[2026-11-21 Cash and GCash only at the desk]]
- [[2026-11-21 Payment claims get their own model]]
