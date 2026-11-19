---
date: 2026-11-14
status: accepted
tags: [decision]
---
# Debug screenshots and prototype assets removed
- Decision: Delete 15 root debug/screenshot files, the empty `scratch/` directory, `web/sidebar-fx.css`, `web/trainer-portal.js`, `web/staff/` and `web/assets/js/pages/`; keep `web/assets/css/staff.css`, `web/assets/img/logo.jpg` and `web/assets/js/staff-*.js` because trainer pages use them.
- Reason: References were checked across `web/trainer/`, `web/sw.js`, `api/`, `apps/` and `docs/` before deleting; active root files must stay for WhiteNoise root URLs, `sw.js` precaching and docs links.
- Trade-offs: Not stated in log
- Evidence: `web/sidebar-fx.css`, `web/trainer-portal.js`, `web/staff/`, `web/assets/js/pages/`; Source: PROJECT-LOG.md, 2026-11-14 03:28.

## Related
- None
