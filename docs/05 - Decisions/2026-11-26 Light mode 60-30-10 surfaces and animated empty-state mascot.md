---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Light mode 60-30-10 surfaces and animated empty-state mascot
- Decision: Standardize light-mode backgrounds, containers, tables, segmented trays, and form inputs across all portals in `web/pf-system.css?v=3` (plus `web/claim.html`) using the 60/30/10 palette (`#F7F4EE` 60% neutral canvas and inset inputs/table headers, `#FFFFFF` with `1px solid #E6DFD2` for all 30% elevated containers/cards/panels/modals/rows, `#E8B93A` 10% gold accent), while keeping dark sidebars and dark photo hero cards intact. Replace static placeholder icons in empty/no-data states (non-loading, non-error) with a self-contained animated SVG mascot at `web/img/empty-mascot.svg`.
- Reason: Earlier portal CSS files mixed cool slate whites (`#f8fafc`, `#f1f5f9`), warm cream (`#faf6ee`, `#f3ece1`), and hardcoded dark colors (`#131C2E`, `rgba(11, 18, 32, 0.65)` in `announcements.css`), causing mismatched containers and form fields in light mode. Serving a local animated SVG mascot instead of external `i.pinimg.com` GIF URLs guarantees reliable loading offline and inside Chrome/Android without hotlink failures, while respecting `prefers-reduced-motion`.
- Trade-offs: Empty-state slots use CSS `::before` with `/img/empty-mascot.svg` and hide their static placeholder icon so existing JS templates did not need per-page HTML rewrites.
- Evidence: `web/img/empty-mascot.svg` (XML validated), `web/pf-system.css` (`?v=3` across all 21 portal HTML files, brace-balanced `60/60`), `web/claim.html` (brace-balanced `144/144`); `python manage.py check` (0 errors) and `python manage.py test` (292/292 OK in 466.670s with in-memory SQLite) passed. (`ruff` not installed; no Python files modified.)

## Related
- [[2026-11-26 Unified 5-state interaction system in pf-system.css]]
- [[2026-11-19 Distill to one gold palette]]
