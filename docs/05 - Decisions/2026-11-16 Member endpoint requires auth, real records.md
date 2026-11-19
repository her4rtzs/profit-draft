---
date: 2026-11-16
status: accepted
tags: [decision]
---
# Member endpoint requires auth and returns real records
- Decision: Enrich `GET /api/member/me/` with `IsAuthenticated` and real `Subscription`, `Enrollment` and `Payment` data, clamp `remainingDays >= 0`, report `EXPIRED` / `EXPIRING_SOON` / `ACTIVE` / `PENDING`, and remove the silent `demoData()` fallback on API errors in favour of explicit error/retry states.
- Reason: A member portal must derive state from the logged-in member's server data and must not hide a failed API call behind sample data.
- Trade-offs: Not stated in log
- Evidence: `GET /api/member/me/`, `api/member.py`, `web/member-shell.css`, `web/member-home.html`; Source: PROJECT-LOG.md, 2026-11-16 08:18.

## Related
- None
