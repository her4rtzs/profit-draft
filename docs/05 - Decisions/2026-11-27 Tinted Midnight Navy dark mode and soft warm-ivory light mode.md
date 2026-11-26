---
date: 2026-11-27
status: superseded
tags: [decision]
---
Superseded by: [[2026-11-27 Pair Light Navy Blue with Dark Midnight Navy]]

# Tinted Midnight Navy dark mode and soft warm-ivory light mode
- Decision: Replace neutral near-black and grey dark-mode tokens across all portals, public auth/landing pages, and Tailwind/DaisyUI config with tinted Deep Midnight Navy surfaces (`#0D1526` canvas, `#142038` cards, `#1A2947` headers, `#0A1120` inputs, `#263B63` borders, `#F4F7FC` / `#9EB1D1` high-contrast text) paired with `#E8B93A` gold, and soften Light Mode from pure `#FFFFFF` glare to warm ivory/parchment (`#EFE9DC` canvas, `#FAF7F0` cards, `#F2ECE0` insets, `#DCD2BF` borders, `#231E16` text).
- Reason: Neutral dark grey (`#18191a`/`#242526`) and near-black (`#07080c`/`#0A0E16`) felt lifeless while stark `#FFFFFF` Light Mode cards caused eye strain. Tinted Midnight Navy + warm ivory maintains WCAG contrast without pure black or pure white glare.
- Trade-offs: Overrides legacy stylesheet defaults in `web/pf-system.css`; `static/dist/app.css` still compiles from `static/src/tailwind.config.js` + `static/src/input.css` during the Vercel build (`npm --prefix static/src run build`) since Node is not installed locally.
- Evidence: Modified `web/pf-system.css`, `web/trainer/trainer.css`, `web/member-shell.css`, `web/members-ui.css`, `web/finance-ui.css`, `web/spotify.css`, `web/login.html`, `web/join.html`, `web/forgot.html`, `web/welcome.html`, `web/settings.html`, `static/src/tailwind.config.js`, `static/src/input.css`, and `templates/`.

## Related
- [[2026-11-26 Light mode 60-30-10 surfaces and animated empty-state mascot]]
- [[2026-11-26 Unified 5-state interaction system in pf-system.css]]
