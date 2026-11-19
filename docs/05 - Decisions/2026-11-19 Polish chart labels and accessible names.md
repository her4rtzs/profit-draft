---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Polish chart labels and accessible names
- Decision: Use `--muted` for chart-axis labels in `web/spotify.css` and `web/styles.css`, remove the light-mode `#78716C` axis override in `web/portal-ui.css`, turn donut legend items into real `<button>` elements in `web/index.html`, and drop the bell's `aria-label` overrides in `web/sidebar.js` and `web/notifications-live.js`.
- Reason: Chart axis text at 3.95:1 fails the contrast floor; `li role="button"` is invalid markup; and the bell's accessible name said "you're all caught up" while a badge showed unread updates.
- Trade-offs: Donut keyboard handling now relies on the native button instead of a custom keydown listener, and light-mode axis colour follows the shared token instead of a page-specific override.
- Evidence: `web/spotify.css:888`, `web/styles.css:808`, `web/portal-ui.css`, `web/index.html`, `web/sidebar.js`, `web/notifications-live.js`; `node --check` OK on all three JS files; `python manage.py test` OK.

## Related
- None
