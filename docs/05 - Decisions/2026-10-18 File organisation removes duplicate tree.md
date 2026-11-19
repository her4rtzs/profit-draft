---
date: 2026-10-18
status: accepted
tags: [decision]
---
# File organisation pass removes the stale duplicate tree and dead scripts
- Decision: Delete `ProFit-combined/` (278 files), `web/member-dashboard.js`, `web/member-portal.js`, clean conflict markers in `PROJECT-LOG.md`, and point `web/member-home.html`'s "Explore plans" straight at `join.html`.
- Reason: The tree caused duplicate search hits; the two scripts were unreferenced leftovers of a superseded portal design; "Explore plans" went through a redirect stub.
- Trade-offs: Removed files are recoverable in git; the pass was limited to assets with no remaining references.
- Evidence: `ProFit-combined/`, `web/member-dashboard.js`, `web/member-portal.js`, `web/member-home.html`, 175 tests passed; Source: PROJECT-LOG.md, 2026-10-18 23:35.

## Related
- None
