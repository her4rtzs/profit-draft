---
date: 2026-11-26
status: accepted
tags: [decision]
---
# Allow new Google members on login via OTP gate
- Decision: Route both `/login` and `/join` Google Sign-In through `authenticate_google_member` in `api/auth.py` while keeping `authenticate_google_member` connected-aware across all active roles (`OWNER`, `CASHIER`, `TRAINER`, `MEMBER`) and still returning `not_linked` (`?error=not-linked`) for unlinked Staff/Owner emails.
- Reason: New visitors clicking **Continue with Google** on `/login` expect to connect their Google account directly and complete the first-login **Google -> OTP -> Terms of Service & Privacy Policy** flow, rather than hitting a dead-end "not connected" error reserved for unlinked staff accounts.
- Trade-offs: Clicking **Continue with Google** on `/login` with a brand-new Gmail creates a 7-day `trial` Member account immediately, mitigated by blocking all dashboards/APIs until both Email OTP verification and Terms/Privacy consent complete.
- Evidence: `api/auth.py`, `apps/accounts/google_auth.py`, `apps/accounts/tests/test_google_auth.py`, `apps/accounts/tests/test_google_onboarding_and_invites.py`.

## Related
- [[2026-11-26 Linked Google login and first-login gate]]
- [[2026-11-19 Member-only Google Sign-In with verified linking]]
