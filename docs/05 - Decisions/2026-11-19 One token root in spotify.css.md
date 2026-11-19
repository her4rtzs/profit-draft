---
date: 2026-11-19
status: accepted
tags: [decision]
---
# One token root in spotify.css
- Decision: Keep exactly one global `:root` token block, in `web/spotify.css`, and fold the other 13 shadowed `:root` blocks into it with their effective (last-wins) values. Keep `body.dark` and `@media` `:root` overrides, which are theme/responsive variants rather than duplicate token sources. Do **not** strip the `!important` declarations: they are the load-bearing override mechanism for the stacked fix files and removing them would visibly change the UI. Regenerate the generated `web/dashboard.css` from the 12 ordered sources, preserving the inline fx block. Record the resulting palette in a new root `DESIGN.md` plus `.impeccable/design.json`.
- Reason: The sources carried 14 global `:root` blocks redefining the same 138 custom properties with different palettes; only the last definition of each token had any effect, so the rest were misleading dead code. One block makes the palette editable in one place. The `!important` rules are intentional (e.g. `ui-fixes.css` forces sidebar icons visible and one-column grids), so a blanket purge would break working fixes.
- Trade-offs: The 13 shadowed blocks and their abandoned palettes are gone — the grey/social, tan, sage and other earlier palettes can no longer be restored by deleting a later block. Moving the canonical values into `spotify.css` keeps the existing "one token source" decision intact, but token lookup now starts there instead of `styles.css`. The bundle remains a generated copy, so editing a source still requires re-concatenation.
- Evidence: All 138 effective token values are byte-identical before and after (computed from the original backups and from the regenerated bundle); the bundle has one global `:root`, all 12 sections and the inline `.pf-menu`/`.pf-row-in` block. `detect` ran once on the changed files: only pre-existing `overused-font`/`border-accent-on-rounded` warnings and no token-drift advisories after the sidecar was switched to `var()` references. `ruff`/`manage.py` checks were not run — this change touches CSS and docs only.

## Related
- [[2026-11-19 Distill to one gold palette]]
- [[2026-11-19 Dashboard CSS loads as one generated bundle]]
