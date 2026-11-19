---
date: 2026-11-15
status: accepted
tags: [decision]
---
# Trainer subpages get one shared design and real endpoints
- Decision: Add the shared `.tw-*` component set in `web/trainer/trainer.css` to all seven trainer subpages and extend `api/trainers.py`, `api/notifications.py`, `api/urls.py` with check-in, announcements, profile, schedule and attendance endpoints; normalise notification response shapes in `trainer.js`.
- Reason: Subpages must share the portal's visual language and the client must render both wrapped `{unread, items}` and plain array responses without errors.
- Trade-offs: Not stated in log
- Evidence: `web/trainer/trainer.css`, `api/trainers.py`, `api/notifications.py`, `api/urls.py`; Source: PROJECT-LOG.md, 2026-11-15 09:13.

## Related
- None
