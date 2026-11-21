---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Trial status with a server-set end date
- Decision: `MemberProfile` gains a `TRIAL` membership status and a nullable `trial_ends_at` timestamp. `services.start_trial(member)` sets the status and computes `trial_ends_at = now + 7 days` on the server; `services.trial_is_active(member, today=None)` says whether a trial is still running, comparing Asia/Manila local dates so it stays true through the end of the seventh Manila day. No function accepts an end date from a caller.
- Reason: The trial length and its boundary belong in one place, so signup, views, and any future caller cannot disagree or be tricked into extending a trial. A separate field keeps the trial window visible instead of hiding it in `expiry_date`, and comparing Manila dates avoids a UTC timestamp cutting a trial a day early.
- Trade-offs: The status value is uppercase `TRIAL` to match the existing stored values and the `rawStatus` strings the web pages compare, even though the docs write it as `trial`. `enroll_member` does not clear `trial_ends_at`; that is harmless because `trial_is_active` checks the status first. Migration `0005` is created but not applied; the owner must apply it to Dev and Prod.
- Evidence: `apps/membership/models.py`, `apps/membership/services.py`, `apps/membership/migrations/0005_memberprofile_trial_ends_at_and_more.py`, `apps/membership/tests/test_services.py`. `python manage.py test apps.membership` passed 37 tests. No view, signup path, or API changed.

## Related
- [[2026-11-21 Free sign-up with a seven-day trial]]
- [[2026-10-18 Architecture.md rewritten to match code]]
