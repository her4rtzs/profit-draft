---
date: 2026-11-14
status: accepted
tags: [decision]
---
# Serverless deploy keeps migrations out of the build
- Decision: Revert `vercel.json`'s `buildCommand` to npm build + `collectstatic` (no `manage.py migrate`) and handle a missing `event_date` column with savepoints, an idempotent runtime schema check and HTTP 400 responses instead of a deploy-time migration.
- Reason: Vercel build containers have no database access and Django isolates `collectstatic` from PostgreSQL; in PostgreSQL an `UndefinedColumn` aborts the whole transaction, so later statements fail with "current transaction is aborted".
- Trade-offs: Schema repair happens at runtime on the first request rather than as a tracked migration; the earlier attempt to add `migrate` to the build had to be undone.
- Evidence: `vercel.json`, `services.publish()`, `StaffAnnouncementListView.post`, `_ensure_announcements_schema()`, 12 announcement tests OK; Source: PROJECT-LOG.md, 2026-11-14 00:24 and 01:05.

## Related
- None
