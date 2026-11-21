---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Approval notifies the member
- Decision: approving a GCash claim calls the existing `notifications.services.notify` helper with a `MEMBERSHIP` notification, a body naming only the plan and expiry, and a link to the member home. That single call creates the website notification and its best-effort email mirror. A failed email is logged only as a kind code and never rolls back the approval; a repeated approval does not send a second notice.
- Reason: the notification service already owns "in-app row plus email mirror" and swallows mail failures, so no new mail code or second source of truth is needed. The message deliberately omits the reference number and proof link.
- Trade-offs: email is best-effort — if mail is down the member still sees the in-app notice but gets no email. The wording is fixed in the service, not editable by staff.
- Evidence: `api/staff_claims.py`, `apps/billing/tests/test_claim_review.py`. `python manage.py test` passed 279 tests.

## Related
- [[2026-11-21 Staff review of GCash claims]]
