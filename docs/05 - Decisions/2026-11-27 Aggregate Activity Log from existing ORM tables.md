---
date: 2026-11-27
status: accepted
tags: [decision]
---
# Aggregate Activity Log from existing ORM tables
- Decision: Build the per-user Settings Activity Log by querying existing Django ORM models (`User`, `Enrollment`, `PaymentClaim`, `Attendance`, `Announcement`, `TrainerSession`, `TrainerRequest`, `Notification`) on demand inside `apps/accounts/activity.py` instead of introducing a new `ActivityLog` database table.
- Reason: Existing domain tables already timestamp account milestones, enrollments, payment reviews, check-ins, announcements, coaching sessions, and notifications. Querying them through one user-scoped helper gives every role an immediate real activity timeline without creating another table, migration, or Supabase RLS configuration step.
- Trade-offs: Historical profile-field edits or individual password changes without dedicated event rows are not tracked separately; if granular audit events are needed later, a dedicated table can be added without breaking `/api/auth/activity/`.
- Evidence: `apps/accounts/activity.py`, `api/auth.py` (`activity_log_view`), `apps/accounts/tests/test_activity_log.py`.

## Related
- [[2026-10-07 Session and CSRF login as plain views]]
