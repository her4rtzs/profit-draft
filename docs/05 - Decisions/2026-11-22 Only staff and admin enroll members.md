---
date: 2026-11-22
status: accepted
tags: [decision]
---
# Only staff and admin enroll members
- Decision: Update `AGENTS.md` to say enrollment is done only by staff and admin (Cashier or Owner), by recording cash at the desk or confirming a member-submitted GCash payment through the shared membership service. Members and the retired payment-gateway webhook never enroll anyone.
- Reason: The old wording around the retired webhook was easy to misread as an enrollment path. The rule should name the two real enrollment actions and the two roles allowed to do them.
- Trade-offs: The existing webhook decision note is about PayMongo payment status, not enrollment, so it was left as-is. The word "claim" was also removed from the surrounding `AGENTS.md` wording for consistency.
- Evidence: `AGENTS.md` lines 27, 60, 71-72, 80-84, 91, 153-161, 170-177; `api/staff_claims.py`, `apps/billing/tests/test_claim_review.py`; `manage.py check` clean; targeted tests 53 pass.

## Related
- [[2026-11-22 Member payment card replaces claim page]]
- [[2026-10-07 Webhook follows binding spec, single writer]]
