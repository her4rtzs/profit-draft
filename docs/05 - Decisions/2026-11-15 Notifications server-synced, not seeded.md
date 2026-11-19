---
date: 2026-11-15
status: accepted
tags: [decision]
---
# Notifications are server-synced, not seeded
- Decision: Remove the six hardcoded staff and three trainer placeholder notifications; add delete/clear services and trainer-scoped notification endpoints; connect the bell dropdown, unread badge and Notifications page through `PF.syncNotifications()` and the `pf:notifications-updated` event.
- Reason: Separate seeded arrays meant the popover and the page disagreed; both views must read and update the same backend store.
- Trade-offs: Not stated in log
- Evidence: `web/assets/js/staff-data.js`, `web/trainer/trainer.js`, `apps/notifications/services.py`, `api/notifications.py`, `web/trainer/notifications.html`; Source: PROJECT-LOG.md, 2026-11-15 10:02.

## Related
- None
