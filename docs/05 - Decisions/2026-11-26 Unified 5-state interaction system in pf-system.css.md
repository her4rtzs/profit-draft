---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Unified 5-state interaction system in pf-system.css
- Decision: Create `web/pf-system.css` (loaded by all 21 authenticated portal pages and bumped to `?v=2`) as the single override layer enforcing the 5 interactive states across Owner, Cashier, Member, and Trainer portals, update `web/hover-fx.css?v=2`, and align standalone pages (`welcome.html`, `login.html`, `join.html`, `forgot.html`, `claim.html`, `onboarding.html`, `faq.html`) inline styles to the same 5 rules:
  1. Hover (`@media (hover: hover) and (pointer: fine)`): subtle background change only (`rgba(232, 185, 58, 0.12)`/`0.14` or neutral `0.06`/`0.055`), zero glow (`box-shadow: none`), zero hover lift (`transform: none`), zero brightness filter.
  2. Active (`.active`/`.on`/`.is-on`/`[aria-current="page"]`/`[aria-selected="true"]` on interactive controls + primary CTAs): solid gold `#E8B93A` with `#0B0F19` dark ink.
  3. Pressed (`:active`): darker gold `#B8860B` on gold/active controls, deeper neutral fill on secondary controls.
  4. Focus (`:focus-visible` / inputs): thin `2px solid #E8B93A` outline only (inputs keep their clean surface without filled focus backgrounds or fuzzy `box-shadow` rings).
  5. Disabled (`:disabled`, `[aria-disabled="true"]`, `.is-disabled`): opacity `0.48`, `cursor: not-allowed`, `pointer-events: none`, zero hover/active effect.
- Reason: Across `dashboard.css`, `global.css`, `finance-ui.css`, `members-ui.css`, `announcements.css`, `member-shell.css`, `trainer.css`, and inline `<style>` blocks, dozens of inconsistent hover glows, `translateY` lifts, filled focus backgrounds, and missing `pf-system.css` assets existed. Centralizing the rules in `web/pf-system.css` fixes every portal consistently without duplicating or rewriting thousands of legacy lines.
- Trade-offs: Specificity relies on `html body ...` rules in `web/pf-system.css` plus cleaned inline `<style>` rules; future stylesheets should defer interaction state styling to `web/pf-system.css` rather than introducing custom glows or transforms.
- Evidence: `web/pf-system.css`, `web/hover-fx.css`, `web/index.html`, `web/cashier.html`, `web/notifications.html`, `web/profile.html`, `web/settings.html`, `web/member-home.html`, `web/claim.html`, `web/login.html`, `web/join.html`, `web/forgot.html`, `web/onboarding.html`, `web/welcome.html`, `web/faq.html`, and all 21 portal HTML `?v=2` references; CSS brace-balance check passed across all modified files; `python manage.py check` (0 errors) and `python manage.py test` (292/292 OK in 480.936s with in-memory SQLite) passed. (`ruff` not installed; no Python files modified.)

## Related
- [[2026-11-19 Distill to one gold palette]]
- [[2026-11-19 Decorative CSS layer removed]]
