---
date: 2026-11-22
status: accepted
tags: [decision]
---
# Payments for review replaces GCash claims
- Decision: Rename the cashier review tab and heading to "Payments for review", reuse the existing review table, add a Plan column, and call the action "Confirm" instead of "Approve". The proof link still opens in a new tab with `rel="noopener noreferrer"`, and Reject still requires a reason.
- Reason: Staff think in terms of payments waiting for confirmation, not claim paperwork. The review table and the confirm/reject endpoints already do the job, so renaming and adding one column is enough.
- Trade-offs: The database status is still `approved` and the API paths still say "claims"; those were left alone to protect existing data and migrations. Old `/payments#claims` links now need `#review`, which was updated in the dashboard.
- Evidence: `web/payments.html`, `web/payments-review.js`, `web/index.html`, `apps/billing/tests/test_claim_review.py`, `apps/billing/tests/test_claim_api.py`; targeted tests 53 pass; `manage.py check` clean.

## Related
- [[2026-11-22 Member payment card replaces claim page]]
- [[2026-11-21 GCash claims reviewed by staff]]
