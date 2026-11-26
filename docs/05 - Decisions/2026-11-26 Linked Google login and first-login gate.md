---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Linked Google login and first-login gate
- Decision: Allow all roles (`OWNER`, `CASHIER`, `TRAINER`, `MEMBER`) to sign in via Google on `/login` only when `google_sub` is already connected (unlinked Google accounts redirect with `?error=not-linked`), enforce a two-step first-login onboarding gate (Email OTP first, then Terms of Service + Privacy Policy consent) via `FirstLoginOnboardingGateMiddleware` before dashboard/API access, redesign staff invite acceptance with password + matching-email Google activation + `revoked_at`, and provide Connect/Disconnect Google (with passwordless lockout guard) in Settings across all portals.
- Reason: Passwordless Google login cannot bypass email proof or legal consent, staff/owners need Gmail sign-in without opening public registration or email auto-linking risks, and users who sign up via password or Google need safe self-service account linking without accidental lockout.
- Trade-offs: Adding tracking flags on `User` and `revoked_at` on `StaffInvite` (`0008_google_onboarding_and_invite_revoke`) requires running `manage.py migrate` (with serverless column fallback in `ensure_google_user_columns`), and Settings exposes an extra password-setup step before Google-only users can unlink Google.
- Evidence: `apps/accounts/models.py`, `apps/accounts/migrations/0008_google_onboarding_and_invite_revoke.py`, `apps/accounts/middleware.py`, `apps/accounts/services.py`, `apps/accounts/google_auth.py`, `apps/accounts/views.py`, `api/auth.py`, `templates/accounts/accept_invite.html`, `templates/accounts/onboarding_otp.html`, `templates/accounts/onboarding_consent.html`, `web/google-auth.js`, `web/google-connect.js`.

## Related
- [[2026-11-19 Member-only Google Sign-In with verified linking]]
- [[2026-10-07 Session and CSRF login as plain views]]
- [[2026-10-10 Custom auth keeps privileged roles out]]
