---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Server-side trial and membership access
- Decision: `membership.services.member_access(profile)` returns ACTIVE, TRIAL or LOCKED using the Manila date at request time. Two DRF permissions in `api/permissions.py` enforce it: a running trial may only read and edit its own profile, a locked member gets a 403 with a clear payment message, and staff/trainer roles are unaffected. `profit.views.web_page` applies the same rule to static member pages for the MEMBER role. Nothing is deleted, deactivated or written by the check, and no `pg_cron` job is added.
- Reason: Menu hiding is only UX; the server has to refuse the API call itself. Computing the trial end on every request means an expired trial stops working immediately without a scheduled job that could be skipped on the free tier.
- Trade-offs: profile-less users keep their existing 404/empty-list behaviour instead of being blocked by the permission. Tests that expected a PENDING or expired member to read member data were changed to use an active membership, and inactive check-in is now a 403 rather than a 400.
- Evidence: `apps/membership/services.py`, `api/permissions.py`, `api/member.py`, `api/views.py`, `api/trainers.py`, `api/notifications.py`, `api/announcements.py`, `profit/views.py`, `apps/membership/tests/test_access.py`. `python manage.py test` passed 257 tests; `python manage.py test api` passed 15.

## Related
- [[2026-11-21 Trial status with a server-set end date]]
- [[2026-11-21 Sign-up creates a trial member without a checkout]]
