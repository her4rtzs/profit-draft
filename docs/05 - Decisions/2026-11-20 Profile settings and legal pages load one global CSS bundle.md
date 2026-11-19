---
date: 2026-11-20
status: accepted
tags: [decision]
---
# Profile settings and legal pages load one global CSS bundle
- Decision: `web/profile.html`, `web/settings.html`, `web/privacy.html`, `web/terms.html` and `web/faq.html` now load the generated `web/global.css` instead of 14 (staff) or 13 (legal) stylesheet links, and one Google Fonts request for Plus Jakarta Sans + Inter instead of two links loading up to four families.
- Reason: each page blocked first paint on a dozen small stylesheets and a Figtree import hidden inside `spotify.css`. One concatenated file removes the round trips and matches the two-font design system in DESIGN.md.
- Trade-offs: `global.css` is a generated snapshot of 14 source files — editing any source needs re-concatenation in the order written at the top of the file. Legal pages additionally download three profile-only sheets (~94 KB) and staff pages download three legal-only sheets (~16 KB); their selectors target disjoint markup, so neither changes rendering. `"Figtree"` references are mapped to `"Plus Jakarta Sans"` in the bundle (Caveat is unused on these pages), so dashboard-style text shifts slightly. The original source files stay for the pages that still link them.
- Evidence: before/after screenshots at 1280x800 and 390x844 for `privacy.html` and `profile.html` are visually identical; each of the five heads now has one local stylesheet link and one two-family Google Fonts link. `ruff check .` and `manage.py check` could not pass in this environment (195 pre-existing lint errors; ALLOWED_HOSTS required when DEBUG=False).

## Related
- [[2026-11-19 Staff pages load the single dashboard bundle]]
- [[2026-11-19 Dashboard CSS loads as one generated bundle]]
- [[2026-11-19 One Google Fonts request for the dashboard]]
