---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Remove dead ui-final.css and ui-fixes.js
- Decision: Delete `web/ui-final.css` and `web/ui-fixes.js` and remove their link/script tags from the pages that still carried them.
- Reason: `ui-final.css` only declared `--sidebar-w: 260px`, which `sidebar-pro.css` already sets later on every page with a sidebar; `ui-fixes.js` selected `.pp-card` on a page that uses `.pp-section-card`, so it never matched and was a no-op.
- Trade-offs: No visual change was expected. The intended announcement-form swap in `ui-fixes.js` never worked, so that UX is still undelivered - this deletion does not cause it.
- Evidence: `web/ui-final.css` (65 B) and `web/ui-fixes.js` (728 B) deleted; link/script tags removed from 14 pages; repo-wide grep finds no live references outside provenance comments in `web/dashboard.css`.

## Related
- None
