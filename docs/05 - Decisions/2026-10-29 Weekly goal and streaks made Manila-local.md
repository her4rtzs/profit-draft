---
date: 2026-10-29
status: accepted
tags: [decision]
---
# Weekly goal, streak and API values made authoritative and Manila-local
- Decision: Remove hardcoded demo check-ins, count the current Monday–Sunday ISO week instead of a rolling 7-day window, use local date strings throughout, and pre-compute `streak` and `weeklyVisits` server-side in `GET /api/member/me/` with the client preferring those values.
- Reason: A bare `YYYY-MM-DD` passed to `new Date()` is UTC midnight, one day behind in UTC+8, and a rolling window double-counts Mondays; the API previously sent only 30 check-ins, breaking long-term streaks.
- Trade-offs: A client-side calculation is retained as a fallback for demo/offline mode.
- Evidence: `GET /api/member/me/`, `web/member-home.html`, `web/member-tabs.js`, `weekMondayKey()`, `localDateStr()`; Source: PROJECT-LOG.md, 2026-10-29 17:09.

## Related
- None
