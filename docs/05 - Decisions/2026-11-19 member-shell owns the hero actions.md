---
date: 2026-11-19
status: accepted
tags: [decision]
---
# member-shell owns the hero actions
- Decision: Make `web/member-shell.css` the single owner of `.member-hero-actions`: two-column grid with Contact spanning its own row, and a full-width stack below 400 px. Delete the competing grid rules from `web/ui-fixes.css` and `web/hover-fx.css`.
- Reason: Four rules owned the same class. An `!important` two-column grid fought `width: auto !important` with `white-space: nowrap`, so the nowrap labels overlapped on small phones.
- Trade-offs: The stack breakpoint is 400 px, so 375 px now stacks where it previously just cleared; the two-button row is preserved at 401-760 px.
- Evidence: `web/member-shell.css:667`, `web/ui-fixes.css`, `web/hover-fx.css`; rendered at 305, 345, 375 and 420 px with zero overlap; `python manage.py test` OK.

## Related
- None
