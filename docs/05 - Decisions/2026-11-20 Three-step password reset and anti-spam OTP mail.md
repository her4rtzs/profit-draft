---
date: 2026-11-20
status: accepted
tags: [decision]
---
# Three-step password reset and anti-spam OTP mail
- Decision: Split `/forgot` into three sequential steps (Email -> Verify OTP via `POST /api/auth/verify-reset-otp/` -> Change Password via `POST /api/auth/reset-password/`), align SMTP fallback `From:` headers to `EMAIL_HOST_USER`, forward `reply_to` and transactional headers (`Auto-Submitted`, `X-Auto-Response-Suppress`) in Resend, and send clean transactional HTML/text OTP templates.
- Reason: Resend's sandbox sender (`onboarding@resend.dev`) only delivers to the single Resend account owner and triggers spam filters; aligning SMTP fallback sender addresses and sending proper transactional HTML + headers improves inbox placement across all accounts, while verifying the OTP in step 2 prevents users from typing a new password before knowing whether their code is valid.
- Trade-offs: `verify_password_reset_otp` checks and attempt-counts the OTP without consuming it until step 3 (`reset_password`) commits the new password; full inbox delivery to every recipient on Resend still requires verifying `functionalfitnessgym.site` DNS records (SPF/DKIM/DMARC) in Resend or configuring Gmail SMTP credentials in Vercel.
- Evidence: Modified `apps/accounts/email_backends.py`, `apps/accounts/emails.py`, `apps/accounts/services.py`, `api/auth.py`, `api/urls.py`, `web/forgot.html`, `apps/accounts/tests/test_email_backend.py`, `apps/accounts/tests/test_password_reset.py`. Verified with `python manage.py check` (0 errors) and `python manage.py test apps.accounts.tests.test_email_backend apps.accounts.tests.test_password_reset profit.tests.test_clean_urls profit.tests.test_installable` (32/32 OK).

## Related
- [[2026-11-19 Roll back undelivered OTPs and support SMTP]]
- [[2026-11-20 Email notifications and custom domain sender]]
