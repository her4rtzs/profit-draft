---
date: 2026-11-22
status: accepted
tags: [decision]
---
# Remove claim wording from the portals
- Decision: Replace "claim" with "payment" in all member-facing and staff-facing text: menus, buttons, headings, empty states, notices, legal copy and API validation messages. Delete the dead `web/claim.html` page and its `claims-review.js` script, which are replaced by the member payment card and `payments-review.js`.
- Reason: Members and cashiers talk about paying, not filing claims. Keeping the old word in notices and empty states would make the new payment card look half-finished.
- Trade-offs: Internal Python names, API paths, database columns, statuses and old migrations still say "claim". They were deliberately kept so no data or migration history changes. The old `/claim` URL now 404s for bookmarks.
- Evidence: `web/`, `templates/home.html`, `api/staff_claims.py`, `AGENTS.md`; no visible "claim" text remains in `web/` or `templates/`; `manage.py check` clean; targeted tests 53 pass.

## Related
- [[2026-11-22 Member payment card replaces claim page]]
- [[2026-11-21 Member GCash claim submission]]
