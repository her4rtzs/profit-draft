---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Member GCash claim submission
- Decision: `GET/POST /api/member/claims/` accepts only `reference_number` (10-20 digits and spaces) and `proof_link` (https, host `drive.google.com` or `docs.google.com`, max 500 chars). Any other submitted key, including `status`, `amount` or `member_id`, is a 400. The server sets the member, the amount from the latest subscription plan price (monthly when none), method `GCASH` and status `pending_review`. A member may have 3 pending claims at once; rejected claims do not count. Members see only their own claims and statuses. The link is stored as text and never fetched. The new `/claim` page explains "Anyone with the link can view" and cropping out private details.
- Reason: the member should type only what is on the GCash receipt, so the form cannot set a price, a member or an approval state. Validating the host rather than fetching the URL keeps the server from trusting or following a screenshot link.
- Trade-offs: a member whose only access is a free trial is still refused here, because the earlier "trial = profile only" rule was not changed; only active members can submit for now. Without a plan field, the amount follows the latest subscription, defaulting to monthly.
- Evidence: `api/claims.py`, `api/urls.py`, `web/claim.html`, `web/member-home.html`, `apps/billing/tests/test_claim_api.py`. `python manage.py test` passed 270 tests.

## Related
- [[2026-11-21 Payment claims get their own model]]
- [[2026-11-21 Server-side trial and membership access]]
