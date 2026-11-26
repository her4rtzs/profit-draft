---
date: 2026-11-27
status: accepted
tags: [decision]
---
# Circular logo crest and standalone auth UX
- Decision: Replace the stacked square emblem and text badges (`PROFIT`, `SIGN IN`, `SIGN UP`, `RESET`) in the installed shortcut (`html.pf-standalone`) with a single gold-rimmed circular ProFit logo crest straddling a full-bleed curved arch across Welcome (`web/welcome.html`), Sign In (`web/login.html`), Sign Up (`web/join.html`), and Reset Password (`web/forgot.html`), add smooth reduced-motion-safe entrance/glow/sheen animations, unclip the crest badge and fix the collapsed `+63` phone pill container, play the standalone splash (`web/splash.js`) once per app session via `sessionStorage` so Back navigation opens Welcome immediately, and use inline SVGs for critical auth UI icons.
- Reason: Live Playwright inspection across phone, landscape, and tablet viewports showed `.lg-shell` and `.jn-shell` `overflow: hidden` slicing the crest circle in half, `.lg-shell::before`/`::after` bleeding the desktop hero photo through the Sign In arch, `.jn-phone-wrap` missing an outer border and mismatching `+63` height (`44px` vs `46px`), `web/forgot.html` falling back to desktop web chrome, `body { max-width: 480px }` leaving white/black sidebars on landscape and tablet screens, `web/splash.js` overlapping `Skip` in landscape and replaying 3.7s on every Back tap, and CDN icons disappearing offline before cache warm-up.
- Trade-offs: Inline SVG markup and standalone `<style>` blocks add a small amount of per-page HTML size instead of an extra stylesheet request, in exchange for zero first-paint flash and offline-reliable controls.
- Evidence: `web/splash.js`, `web/welcome.html`, `web/login.html`, `web/join.html`, `web/forgot.html`, `web/sw.js`, `web/index.html`, `web/cashier.html`, `web/member-home.html`; Playwright audit `0` issues across 6 viewports (`320x568`, `360x640`, `390x844`, `430x932`, `667x375` landscape, `768x1024` tablet) plus 4 desktop pages; `python manage.py check` (0 errors; pre-existing `staticfiles.W004`); `python manage.py test profit.tests.test_installable` (12/12 OK) and full `python manage.py test` on SQLite (326/327 passed; 1 pre-existing unrelated failure in `apps.billing.tests.test_claim_review` on `cashier.html`).

## Related
- [[2026-11-27 Safe offline read mode with auto-refresh and logout wipe]]
- [[2026-11-27 Pair Light Navy Blue with Dark Midnight Navy]]
- [[2026-11-27 Disable service worker on localhost HTTP]]
