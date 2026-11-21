---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Uniform faceless avatars across all portals and 8-step member onboarding
- Decision: Standardize on six flat-vector faceless human avatars (`av-1`..`av-6`) in `ProFitAvatar` (`web/config.js`) with a global uniform style rule removing glowing avatar rings/shadows across all portals and cache-busted script tags on all `web/*.html` pages; add an 8-step member onboarding wizard at `/onboarding` (`web/onboarding.html`, `web/onboarding.js`) with progress bar, 7-day trial notice, 6 faceless avatar picker, first+last name and 10–13 digit phone validation, goals/experience/time selection, optional body stats (with staff-only health notes) and emergency contact with Skip, Review with per-section Edit buttons, and Done linking to `/member-home`; persist onboarding answers in `MemberProfile.onboarding_data` (`apps/membership/migrations/0006_memberprofile_onboarding_data.py`).
- Reason: Different tabs previously showed inconsistent or glowing avatars due to mixed initials/photo renderers, `.gold-frame` glow styles, and cached script URLs. Pairing the six faceless avatars with the member onboarding wizard gives new trial members a guided setup and guarantees one consistent avatar look everywhere.
- Trade-offs: Onboarding metadata is stored in a single `JSONField` (`onboarding_data`) on `MemberProfile` rather than separate columns so optional fields stay flexible without frequent migrations; production requires applying migration `0006_memberprofile_onboarding_data` (with a cold-start fallback in `api/index.py`).
- Evidence: `apps/membership/models.py`, `apps/membership/migrations/0006_memberprofile_onboarding_data.py`, `api/member.py`, `api/auth.py`, `api/index.py`, `profit/views.py`, `web/config.js`, `web/auth.js`, `web/cashier.js`, `web/pages.js`, `web/member-tabs.js`, `web/member-home.html`, `web/trainers-staff.js`, `web/onboarding.html`, `web/onboarding.js`, `apps/membership/tests/test_name_phone_and_cashiers.py`.

## Related
- [[2026-11-21 Persistent avatars cartoon defaults and sidebar logout]]
- [[2026-11-21 Server-side trial and membership access]]
