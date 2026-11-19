---
date: 2026-11-19
status: accepted
tags: [decision]
---
# One Google Fonts request for the dashboard
- Decision: `web/index.html` requests every dashboard font family and weight in one Google Fonts link (Caveat 700, Figtree 400–900, Inter 400–800, Plus Jakarta Sans 400–800). The second link and the Figtree `@import` inside the CSS are gone from this page.
- Reason: The page asked for Plus Jakarta Sans twice with different weight sets and pulled three families through three paths, adding render-blocking requests on a slow phone connection.
- Trade-offs: Figtree is no longer pulled in through `spotify.css` on this page, so the head link and the bundle must stay in sync if the font changes. Other pages still get Figtree from `spotify.css` and are untouched. Font Awesome still loads from cdnjs.
- Evidence: `web/index.html` line 27; `web/dashboard.css` header records that the Figtree `@import` was stripped from the spotify.css section.

## Related
- [[2026-11-19 Dashboard CSS loads as one generated bundle]]
