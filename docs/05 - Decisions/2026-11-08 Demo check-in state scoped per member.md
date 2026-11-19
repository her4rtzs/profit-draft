---
date: 2026-11-08
status: accepted
tags: [decision]
---
# Demo check-in state scoped per member
- Decision: For an authenticated member derive "checked in today" only from the server-provided attendance list; write the global demo `localStorage` key only in demo/offline mode and clear it on real login and on logout; scope calendar dots the same way.
- Reason: The un-scoped key was shared by every account on the same browser, so Account B inherited Account A's check-in.
- Trade-offs: Not stated in log
- Evidence: `web/member-home.html`, `web/member-tabs.js`, `auth.js`, `profit-member-demo-checkins`; Source: PROJECT-LOG.md, 2026-11-08 13:10.

## Related
- None
