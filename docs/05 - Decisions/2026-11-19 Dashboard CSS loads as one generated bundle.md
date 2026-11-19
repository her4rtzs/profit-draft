---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Dashboard CSS loads as one generated bundle
- Decision: `web/index.html` now loads a single `web/dashboard.css` instead of 12 separate stylesheets plus an inline `<style>`. The bundle concatenates those files in their original load order and folds the inline `#pf-dash-fx` block in at its original position.
- Reason: All 12 files were render-blocking on first paint (~599 KB). One link removes 11 round trips. Keeping the exact order preserves the override cascade — for example `pf-modern.css` switches off the row-in animation that the inline block defines.
- Trade-offs: The bundle is a generated copy, so editing a source CSS file will not change the dashboard until the bundle is regenerated; its header comment records the source order. The original files stay because other pages still link them.
- Evidence: `web/dashboard.css` (600,481 bytes, 13 source sections), `web/index.html` (3 stylesheet links remain: Google Fonts, Font Awesome, the bundle). `manage.py check` with local `DEBUG=True` shows only the pre-existing `static/dist` warning.

## Related
- [[2026-11-19 Decorative CSS layer removed]]
