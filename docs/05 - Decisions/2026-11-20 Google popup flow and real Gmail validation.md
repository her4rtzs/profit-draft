---
date: 2026-11-20
status: accepted
tags: [decision]
---
# Google popup flow and real Gmail validation
- Decision: Set `SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"` in `profit/settings.py`, switch `web/google-auth.js` from an invisible rendered GIS button iframe (`accounts.google.com/gsi/transform`) to `google.accounts.oauth2.initTokenClient` with server-side verification (`verify_google_access_token` in `apps/accounts/google_auth.py` and `POST /api/auth/google/`), and enforce real Gmail syntax/typo/disposable-domain validation (`apps/accounts/validators.py` + `window.ProFitAPI.validateRealEmail` in `web/api.js`) across login, signup/join, forgot password, and Google auth while removing the localhost fake-demo login fallback in `web/login.html`.
- Reason: Django's default `same-origin` COOP header severed `window.opener` on the `/login` and `/join` popups, and the hidden `gsi/transform` relay iframe hung as a blank white window (especially in Brave) and left the UI behind it showing errors; switching to `initTokenClient` uses a standard direct OAuth2 popup that posts `{ access_token }` to the backend for tokeninfo + userinfo verification, while strict Gmail validation prevents placeholder, numeric-only, <6-char, typo (`gmai.com`), and disposable emails.
- Trade-offs: `verify_google_access_token` performs two short HTTPS GET requests (`tokeninfo` + `userinfo`) per OAuth2 popup sign-in rather than local RS256 JWKS verification, while `validate_real_email` allows non-Gmail custom/test domains (`example.com`, `.test`) so automated tests and legitimate gym/organization domains stay supported.
- Evidence: `profit/settings.py`, `apps/accounts/validators.py`, `apps/accounts/google_auth.py`, `apps/accounts/forms.py`, `apps/billing/services.py`, `apps/membership/services.py`, `api/auth.py`, `web/api.js`, `web/google-auth.js`, `web/login.html`, `web/join.html`, `web/forgot.html`, `apps/accounts/tests/test_google_auth.py`; `python manage.py check`: 0 errors (1 pre-existing `staticfiles.W004` warning); `python manage.py test`: 237/237 OK.

## Related
- [[2026-11-19 Member-only Google Sign-In with verified linking]]
- [[2026-11-20 Clean extensionless URLs for web pages]]
