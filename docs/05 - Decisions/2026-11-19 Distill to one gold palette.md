---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Distill to one gold palette
- Decision: Collapse the seven user-selectable accents to one Gold palette, with `web/spotify.css` as the single source of the `--gold*` brand tokens (loaded on every page). Remove the leftover decorative set — the welcome page's marquee and hazard stripes, gradient text, blurred halo pseudo-elements and radial-gradient background washes — and regenerate the generated `web/dashboard.css` bundle from the updated sources, preserving its functional inline fx block.
- Reason: The accent switcher and layered override files carried the same brand colour in many competing values, and repeated decoration buried the product. One palette and one token source make the gold consistent and remove the noise; keeping the dashboard as one generated bundle preserves the override cascade without extra round trips.
- Trade-offs: The six non-gold accents and their Settings/trainer/member swatches are gone, so users who had picked one now see Gold. Functional chart grid lines, focus rings and selection indicators stay; only decorative halos and glows were removed. The bundle is a generated copy, so editing a source file still requires re-concatenation. `ui-final.css` and `ui-fixes.js` were already deleted in an earlier commit, so no further fix files qualified as empty.
- Evidence: No `data-accent` values other than `gold` remain in `web/` outside provenance comments; `web/dashboard.css` regenerated from 12 ordered sections (603,232 bytes) with the inline `.pf-menu`/`.pf-row-in` block intact; `manage.py check` with local `DEBUG=True` shows only the pre-existing `static/dist` warning. The full test run was not completed because it needs external database configuration; `ruff check .` still reports 184 pre-existing Python lint issues. Neither is caused by this static-only change.

## Related
- [[2026-11-19 Decorative CSS layer removed]]
- [[2026-11-19 Dashboard CSS loads as one generated bundle]]
