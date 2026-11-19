---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Staff pages load the single dashboard bundle
- Decision: The six staff pages (announcements, attendance, members, payments, reports, trainers) now load the existing `web/dashboard.css` bundle in place of their 12 shared stylesheets, keeping only their one page-specific CSS file as a trailing link. Each page's two Google Fonts requests are merged into the same single request the dashboard uses.
- Reason: every page loaded 15 render-blocking stylesheets (~593 KB) before first paint. One shared bundle removes 11 round trips per page and reuses the CSS asset the dashboard already downloads.
- Trade-offs: the bundle's cascade order differs from the old per-page order — `portal-ui.css` now follows `staff-design.css` instead of preceding it — so shell overrides may render slightly differently until checked in a browser. Page-specific CSS (members-ui, announcements, attendance-ui, finance-ui) stays separate. The bundle is generated, so editing a source file still needs re-concatenation.
- Evidence: six `web/*.html` heads now carry 4 stylesheet links each (was 15). `loading="lazy"` added to the below-fold story hero in `web/welcome.html` and the footer logos in `web/faq.html`, `web/privacy.html`, `web/terms.html`; above-fold logos and the LCP hero stay eager. `manage.py check` not runnable in this environment (Django deps absent).

## Related
- [[2026-11-19 Dashboard CSS loads as one generated bundle]]
- [[2026-11-19 One Google Fonts request for the dashboard]]
