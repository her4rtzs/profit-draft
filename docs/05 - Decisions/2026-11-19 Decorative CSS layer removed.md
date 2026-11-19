---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Decorative CSS layer removed
- Decision: Remove the repeated edge stripes, radial halos, sparkline/watermark SVGs, icon glows, chart swoosh and duplicate page titles, prune the variables left orphaned by them, and commit that change alone.
- Reason: The same decoration was duplicated on every page and buried the brand; mixing a deletion with a palette or bundling change makes it impossible to see which edit broke a page.
- Trade-offs: Palette merge, `!important` reduction, CSS bundling and copy fixes were deferred; the pre-existing extra `}` in `web/styles.css` was noted, not fixed.
- Evidence: `web/styles.css`, 13 files (+56/−392), 206 tests OK; Source: PROJECT-LOG.md, 2026-11-19 09:10.

## Related
- None
