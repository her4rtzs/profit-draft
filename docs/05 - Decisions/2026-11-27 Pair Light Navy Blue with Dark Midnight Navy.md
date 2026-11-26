---
date: 2026-11-27
status: accepted
tags: [decision]
---
# Pair Light Navy Blue with Dark Midnight Navy
- Decision: Apply the owner's unified Navy + Yellow palette across Light Mode (`#F7F8FC` base, `#FFFFFF` surface, `#EEF2FA` inset/header fill, `#DDE3F0` borders, `#E7ECF6` row dividers, `#0B1530` text, `#4A5878` muted text, `#F5C518` yellow accent on buttons/badges, `#8A6A00` accent text on light, and `#243866 -> #1F2F55` Classic Navy sidebar/hero dock) paired with Dark Mode (`#070B18` base/dark sidebar, `#0F1A33` surface, `#162547` elevated, `#1F2F55` border, `#F5C518` accent, `#F4F6FB` text, `#9FB0D6` muted text). Preserve `<meta name="theme-color" content="#0a0e17">` verbatim for PWA head-tag checks.
- Reason: Aligns the entire Light Mode and Dark Mode system to the exact hex palette supplied by the owner, eliminating seam mismatches while preserving readable contrast (`#8A6A00` for gold text on white) and lighter Light Mode navigation chrome (`#243866 -> #1F2F55`).
- Trade-offs: Pre-built `static/dist/app.css` for Django templates compiles on deploy in Vercel (`npm --prefix static/src run build`) because Node.js is not installed locally; legacy static-only bundles (`dashboard.css`, `global.css`, `portal-ui.css`) are unreferenced by HTML pages and overridden by `web/pf-system.css?v=39`.
- Evidence: Updated `web/pf-system.css` (`?v=39`), `web/trainer/trainer.css` (`?v=35`), `web/finance-ui.css` (`?v=37`), `web/member-shell.css`, `web/members-ui.css`, `web/attendance-ui.css`, `web/spotify.css`, `web/**/*.html`, `static/src/tailwind.config.js`, `static/src/input.css`, and `templates/` (`portal_error.html`, `onboarding_otp.html`, `onboarding_consent.html`). Verified with `python manage.py check` and `python manage.py test profit.tests`.

## Related
- [[2026-11-27 Tinted Midnight Navy dark mode and soft warm-ivory light mode]]
- [[2026-11-26 Unified 5-state interaction system in pf-system.css]]
