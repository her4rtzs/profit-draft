---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Persistent user avatars, cartoon defaults, sidebar logout, and anti-spam invite mail
- Decision: Add `User.avatar_data` (`apps/accounts/migrations/0006_user_avatar_data.py`) persisted via `PATCH /api/auth/profile/` and returned in `/api/auth/session/` and `/api/staff/cashiers/`; scope `ProFitProfile` browser cache per user ID with server-verified session data taking priority; add deterministic flat-vector human cartoon SVG avatars (`ProFitAvatar` in `web/config.js`) across staff, member, and trainer portals; fix sidebar account menu click-toggle and capture-phase `[data-logout]` handling; upgrade `/cashiers` with avatars, refined cards, and a `...` Actions dropdown; rewrite `send_invite_email` with gym-specific non-promotional subject, personal greeting, and plain fallback URL to reduce Gmail spam filtering.
- Reason: A single shared `localStorage` key (`profit-account-v1`) leaked names/avatars across logins and lost uploaded photos on other browsers; `railAvatar` only opened `#accountMenu` when `.close` was present; and generic "You've been invited" HTML with a single CTA pill triggered Gmail spam filters.
- Trade-offs: `avatar_data` is stored as a bounded base64 data URL (max ~900 KB) on `accounts_user` matching the existing `MemberProfile.photo_data` convention, rather than adding Supabase Storage upload endpoints right now. Production requires applying migration `0006_user_avatar_data` (with a cold-start fallback in `api/index.py`).
- Evidence: `apps/accounts/models.py`, `apps/accounts/migrations/0006_user_avatar_data.py`, `apps/accounts/emails.py`, `api/auth.py`, `api/cashiers.py`, `api/index.py`, `web/config.js`, `web/auth.js`, `web/sidebar.js`, `web/layout.js`, `web/profile.js`, `web/cashiers.html`, `web/cashiers.js`, `web/members.js`, `web/member-home.html`, `web/trainer/profile.html`.

## Related
- [[2026-11-21 Staff cashiers full names and phone duplicate warning]]
- [[2026-11-20 Three-step password reset and anti-spam OTP mail]]
