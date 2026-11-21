---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Staff review of GCash claims
- Decision: Owner and Cashier review pending claims from a "GCash claims" tab on the Payments page (`web/payments.html`). `GET/POST /api/staff/claims/...` checks logged in, active and role on the server. Approval runs in one transaction: it marks the claim approved with reviewer and time, calls the existing `enroll_member` service, and sets the expiry from the plan price on the claim. A second approval is a no-op. Rejection requires a reason and enrolls nobody. The proof link opens in a new tab with `rel="noopener noreferrer"`, and nothing logs names, references or links.
- Reason: Approval has to be atomic — a half-approved claim could leave someone paying without a membership. Reusing the one enrollment service keeps cash and GCash enrollment consistent, and the status guard plus row lock stop a double click from extending the expiry twice.
- Trade-offs: the plan is recovered from the stored amount rather than a plan field on the claim, so a price change would need a migration-approved mapping update. Rejected claims stay visible to the member with their reason. Migration `billing.0005` is still not applied, so this endpoint needs it before it can read claims.
- Evidence: `api/staff_claims.py`, `api/permissions.py`, `api/urls.py`, `web/payments.html`, `web/claims-review.js`, `apps/billing/tests/test_claim_review.py`. `python manage.py test` passed 276 tests.

## Related
- [[2026-11-21 Member GCash claim submission]]
- [[2026-11-21 Payment claims get their own model]]
