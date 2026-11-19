---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Member-only Google Sign-In with verified linking
- Decision: Add Member-only Google Sign-In using Google Identity Services (ID tokens) plus an OAuth 2.0 authorization code redirect fallback (`/api/auth/google/login/` and `/api/auth/google/callback/`), verifying RS256 ID tokens in Python's standard library (`apps/accounts/google_auth.py`), storing `google_sub` and `google_linked_at` on `User` (`0005_user_google_linked_at_user_google_sub`), and requiring password verification before linking an existing email-matched Member account.
- Reason: ProFit must keep Member and Staff/Trainer authentication strictly separate, avoid adding third-party crypto packages outside `requirements.txt`, and prevent account takeover from unverified auto-linking by email alone.
- Trade-offs: Pure-stdlib RSA PKCS#1 v1.5 SHA-256 verification and `urllib` JWKS caching avoid new dependencies on Vercel/free tier, though rotated Google JWKS keys require cache refresh (handled automatically on `kid` miss); members whose email already exists must enter their password once to link Google.
- Evidence: `apps/accounts/models.py`, `apps/accounts/migrations/0005_user_google_linked_at_user_google_sub.py`, `apps/accounts/google_auth.py`, `api/auth.py`, `api/urls.py`, `web/google-auth.js`, `web/login.html`, `web/join.html`, `apps/accounts/tests/test_google_auth.py`; Source: PROJECT-LOG.md, 2026-11-19 22:15.

## Related
- [[2026-10-07 Session and CSRF login as plain views]]
- [[2026-10-10 Custom auth keeps privileged roles out]]
