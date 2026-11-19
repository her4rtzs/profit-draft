---
date: 2026-11-20
status: accepted
tags: [decision]
---
# Email notifications and custom domain sender
- Decision: Configure `functionalfitnessgym.site` and `www.functionalfitnessgym.site` in `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `DEFAULT_FROM_EMAIL` (`ProFit <noreply@functionalfitnessgym.site>`), and `SITE_BASE_URL`; mirror in-app notifications (`notify` and `notify_many`) to active recipients' email addresses via a best-effort helper `_send_notification_emails`; trigger an active-membership notification from `activate_paid_payment`; add a one-time Resend sandbox fallback (`ProFit <onboarding@resend.dev>`) when Resend returns HTTP 403/422 before custom-domain DNS verification completes; and normalize `_google_callback_url` to stay on the active request host.
- Reason: Connecting the custom domain `functionalfitnessgym.site` enables Resend to deliver OTPs, password resets, payment confirmations, announcements, and trainer alerts to any member's Gmail inbox instead of blocking unverified recipients on `onboarding@resend.dev`, while best-effort per-recipient exception handling ensures mail outages never roll back database transactions.
- Trade-offs: Sending an email inside `notify` / `notify_many` adds sequential HTTPS/SMTP latency on publish or assignment actions until a background queue exists (mitigated on low gym volume by `EMAIL_TIMEOUT = 10` and `notify_many` audience scoping); unverified custom-domain DNS falls back to `onboarding@resend.dev` (or Gmail SMTP if configured) until the user adds the Resend DNS records.
- Evidence: `profit/settings.py`, `apps/accounts/email_backends.py`, `apps/notifications/services.py`, `apps/billing/services.py`, `api/auth.py`, `apps/notifications/tests/test_notifications_api.py`, `apps/accounts/tests/test_email_backend.py`, `apps/accounts/tests/test_google_auth.py`; `python manage.py check`: 0 errors (1 pre-existing `staticfiles.W004` warning); `python manage.py test`: 228/228 OK.

## Related
- [[2026-11-19 Roll back undelivered OTPs and support SMTP]]
- [[2026-11-19 Member-only Google Sign-In with verified linking]]
