---
date: 2026-11-22
status: accepted
tags: [decision]
---
# Member payment card replaces claim page
- Decision: Move the member GCash form onto My Membership as a "Pay for membership" card, store the chosen plan on `PaymentClaim`, validate references as 10-13 digits, and notify the member in-app and by email when a payment is submitted or rejected.
- Reason: Trial and expired members can now open the page where they pay, the amount always comes from the chosen server-side plan, and Payment History shows Pending/Confirmed/Rejected without a second claim page.
- Trade-offs: The old `/claim` URL is gone, so bookmarks return 404; internal model and URL names still say "claim"; cash desk payments still do not appear in member Payment History.
- Evidence: `web/member-home.html`, `web/member-shell.css`, `api/claims.py`, `api/member.py`, `api/staff_claims.py`, `apps/finance/services.py`, `apps/billing/models.py`, `apps/billing/migrations/0006_paymentclaim_plan.py`; `python manage.py check` clean; 280 tests pass.

## Related
- [[2026-11-21 Member GCash claim submission]]
- [[2026-11-21 GCash claims reviewed by staff]]
- [[2026-11-21 Approval notifies the member]]
