---
date: 2026-11-27
status: accepted
tags: [decision]
---
# Align Trainer mobile UI and resolve cartoon avatars
- Decision: Keep Trainer mobile toolbars in uniform 2-column filter grids and equal 2-column hero button bars (`<= 640px`), stack the Trainer Profile hero at `<= 780px`, lock Trainer Settings/Profile switches to `46px × 26px`, and resolve empty member/trainer photos via `ProFitAvatar` inside `PF.avatar`.
- Reason: On coarse-pointer mobile browsers (`@media (pointer: coarse)`), inherited `min-height: 44px` on `input` distorted toggle switches into circles, uneven pill wrapping left orphan filter buttons and trailing blank gaps, and empty `photo` fields caused `PF.avatar` to fall back to initials instead of matching the app's cartoon avatar standard.
- Trade-offs: Filter bars with odd pill counts or narrow screens may truncate long labels slightly earlier inside 2-column mobile tracks, though none of the current Trainer tabs exceed the 2-column track width; keeping `photo`/`member_photo` in Trainer JSON payloads adds one user avatar string per serialized roster/attendance row.
- Evidence: Modified `apps/trainers/services.py`, `api/trainers.py`, `web/assets/js/staff.js`, `web/pf-system.css`, `web/trainer/trainer.css`, and all 8 `web/trainer/*.html` files; Playwright audit passed 67/67 checks across 6 viewports + Dark/Light Mode + interactive controls; `python manage.py check` (0 errors) and `python manage.py test apps.trainers profit.tests` (58/58 OK).

## Related
- [[2026-11-21 Uniform faceless avatars and member onboarding wizard]]
- [[2026-11-27 Unify staff tablet navigation at 980px]]
