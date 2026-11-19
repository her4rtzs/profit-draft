---
date: 2026-11-19
status: accepted
tags: [decision]
---
# One shared heading and skip-link shell
- Decision: Add a first-element skip link and an `sr-only` `<h1>` fallback in `web/site-footer.js`, add a static topbar `<h1>` to nine staff pages, and promote the four `.kpi-title` headings in `web/index.html` from `h3` to `h2`.
- Reason: Seven staff pages had no `h1`, the dashboard skipped heading levels, and no page offered a skip link (WCAG 1.3.1, 2.4.1, 2.4.6).
- Trade-offs: `trainer-portal.html` is a redirect stub with no main content, so it has no skip link. The static `<h1>` is replaced by `layout.js` at runtime, making it a no-JS fallback. Screenshots were unavailable, so verification was DOM-based.
- Evidence: `web/site-footer.js`, `web/index.html` and eight staff pages; 18 root pages load the shared script, nine staff pages have a static `h1`, no `.kpi-title` remains `h3`; `node --check` OK; `python manage.py test` OK.

## Related
- None
