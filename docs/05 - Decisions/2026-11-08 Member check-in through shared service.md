---
date: 2026-11-08
status: accepted
tags: [decision]
---
# Member check-in goes through the shared service and persists
- Decision: Add `POST /api/member/check-in/` in `api/member.py`, call `check_in_member(profile, recorded_by=request.user)`, enforce active memberships and same-day idempotency, keep a local-storage fallback only for demo/offline mode, and start the streak check from yesterday when today has no check-in.
- Reason: Client-only state vanished on reload; a streak stays alive until midnight; the shared service is the single place for enrollment/attendance logic.
- Trade-offs: Offline/demo check-ins still live in browser storage and are not authoritative.
- Evidence: `POST /api/member/check-in/`, `api/member.py`, `api/urls.py`, `apps/membership/services.py`, `apps/membership/tests/test_api.py`, `web/member-home.html`; Source: PROJECT-LOG.md, 2026-11-08 12:57.

## Related
- None
