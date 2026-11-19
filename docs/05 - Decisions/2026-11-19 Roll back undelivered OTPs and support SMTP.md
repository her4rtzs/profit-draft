---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Roll back undelivered OTPs and support SMTP
- Decision: Roll back any newly created `EmailOTP` row and restore previously unexpired OTPs when `send_otp_email` or `send_reset_email` fails (`_issue_and_send_otp`), add a `User-Agent` header + optional `SMTPEmailBackend` fallback in `apps/accounts/email_backends.py`, surface delivery/rate-limit errors in `POST /api/auth/forgot-password/` instead of returning a silent `200`, and trim whitespace on submitted OTP codes.
- Reason: Persisting the OTP before delivery invalidated working codes and locked users into a 60-second cooldown whenever Resend rejected or failed; missing `User-Agent` caused Cloudflare `403` responses on `api.resend.com`, and silent `200` on `forgot-password` advanced the UI even when no email was sent.
- Trade-offs: Real active accounts now receive HTTP `503`/`429` from `/api/auth/forgot-password/` on genuine backend failures or hourly abuse while preserving `200` anti-enumeration for unknown emails; local dev with SMTP credentials requires `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` in `.env` or Vercel.
- Evidence: `apps/accounts/email_backends.py`, `apps/accounts/services.py`, `api/auth.py`, `profit/settings.py`, `apps/accounts/views.py`, `web/forgot.html`, `templates/accounts/verify.html`; `python manage.py test apps.accounts`: 90/90 OK; Source: PROJECT-LOG.md, 2026-11-19 23:01.

## Related
- [[2026-10-10 Custom email-OTP auth, no third-party package]]
- [[2026-11-14 Serverless deploy keeps migrations out]]
