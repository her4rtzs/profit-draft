"""Email backend selection and a stdlib-only Resend HTTP backend.

Import safety: this module is imported during settings evaluation (settings
calls ``select_email_backend``), so its module-top imports are limited to the
stdlib and ``django.core.mail.backends.base`` / ``django.core.exceptions``.
It imports NO models and NO service code at module top. The canonical
``EmailDeliveryError`` lives in ``services.py`` and is imported lazily inside
``send_messages`` to avoid loading the app/model registry too early.

LOGGING POLICY: never log the recipient, subject, or body. Only an event tag
and (when available) the HTTP status code are logged on failure.
"""

import json
import logging
import smtplib
import urllib.error
import urllib.request

from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger("apps.accounts.email")

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_TIMEOUT = 10
RESEND_SANDBOX_FROM = "ProFit <onboarding@resend.dev>"


def select_email_backend(
    resend_api_key: str,
    debug: bool,
    *,
    smtp_user: str = "",
    smtp_password: str = "",
) -> str:
    """Return the ``EMAIL_BACKEND`` dotted path for the configured transport.

    The console fallback is DEVELOPMENT-ONLY: it writes the full message
    (recipient + OTP code / invite link) to stdout, which Vercel captures as
    function logs. Allowing it when ``DEBUG=False`` would leak the OTP and the
    recipient address to production logs, breaking the "never log PII/OTP"
    guarantee. So an unset key in production is a hard misconfiguration.
    """
    if resend_api_key:
        return "apps.accounts.email_backends.ResendEmailBackend"
    if smtp_user and smtp_password:
        return "apps.accounts.email_backends.SMTPEmailBackend"
    if debug:
        return "django.core.mail.backends.console.EmailBackend"
    raise ImproperlyConfigured(
        "RESEND_API_KEY (or SMTP EMAIL_HOST_USER / EMAIL_HOST_PASSWORD) must "
        "be set when DEBUG is False; the console email backend would leak OTP "
        "codes and recipient addresses to logs."
    )


class SMTPEmailBackend(BaseEmailBackend):
    """Wrap Django's SMTP backend so transport failures raise EmailDeliveryError."""

    def send_messages(self, email_messages):
        from django.core.mail.backends.smtp import EmailBackend as DjangoSMTPBackend

        from .services import EmailDeliveryError

        if not email_messages:
            return 0
        backend = DjangoSMTPBackend(fail_silently=False)
        try:
            sent = backend.send_messages(email_messages)
        except (smtplib.SMTPException, OSError, TimeoutError) as exc:
            logger.warning("event=smtp_send_failed")
            raise EmailDeliveryError("Could not send email via SMTP.") from exc
        if not sent:
            logger.warning("event=smtp_send_failed status=zero_sent")
            raise EmailDeliveryError("SMTP backend accepted zero messages.")
        return sent


class ResendEmailBackend(BaseEmailBackend):
    """Send mail via Resend's HTTPS API using only the stdlib ``urllib``.

    Reads ``RESEND_API_KEY`` / ``DEFAULT_FROM_EMAIL`` from settings at send time
    (never at import time). On any transport error, timeout, non-2xx response,
    or missing key it logs a non-PII warning and optionally falls back to SMTP
    if configured; otherwise raises ``EmailDeliveryError`` so the service caller
    can surface a user-facing error instead of a 500.
    """

    def send_messages(self, email_messages):
        from django.conf import settings

        from .services import EmailDeliveryError

        if not email_messages:
            return 0

        api_key = getattr(settings, "RESEND_API_KEY", "")
        if not api_key:
            logger.warning("event=resend_send_failed status=missing_key")
            if getattr(settings, "EMAIL_HOST_USER", "") and getattr(settings, "EMAIL_HOST_PASSWORD", ""):
                return SMTPEmailBackend().send_messages(email_messages)
            raise EmailDeliveryError("Resend API key is not configured.")

        sent = 0
        try:
            for message in email_messages:
                self._send_one(message, api_key)
                sent += 1
        except EmailDeliveryError:
            if getattr(settings, "EMAIL_HOST_USER", "") and getattr(settings, "EMAIL_HOST_PASSWORD", ""):
                return SMTPEmailBackend().send_messages(email_messages)
            raise
        return sent

    def _send_one(self, message, api_key):
        from .services import EmailDeliveryError

        sender = (message.from_email or "").strip() or RESEND_SANDBOX_FROM
        payload = {
            "from": sender,
            "to": list(message.to),
            "subject": message.subject,
            "text": message.body,
        }
        # Attach an HTML alternative when one is present.
        for content, mimetype in getattr(message, "alternatives", []) or []:
            if mimetype == "text/html":
                payload["html"] = content
                break

        try:
            self._post_payload(payload, api_key)
        except urllib.error.HTTPError as exc:
            # Retry once with Resend's sandbox sender if the custom domain is not
            # verified in Resend yet (403/422) so dev/owner testing stays working.
            if (
                exc.code in (403, 422)
                and sender != RESEND_SANDBOX_FROM
                and "onboarding@resend.dev" not in sender.lower()
            ):
                logger.warning("event=resend_sender_fallback status=%s", exc.code)
                fallback_payload = {**payload, "from": RESEND_SANDBOX_FROM}
                try:
                    self._post_payload(fallback_payload, api_key)
                    return
                except urllib.error.HTTPError as retry_exc:
                    raise EmailDeliveryError("Resend returned an HTTP error.") from retry_exc
            raise EmailDeliveryError("Resend returned an HTTP error.") from exc

    def _post_payload(self, payload, api_key):
        from .services import EmailDeliveryError

        request = urllib.request.Request(
            RESEND_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "ProFitGym/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=RESEND_TIMEOUT) as resp:
                status = getattr(resp, "status", None) or resp.getcode()
                if not (200 <= status < 300):
                    logger.warning("event=resend_send_failed status=%s", status)
                    raise EmailDeliveryError("Resend returned a non-2xx status.")
        except urllib.error.HTTPError as exc:
            logger.warning("event=resend_send_failed status=%s", exc.code)
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.warning("event=resend_send_failed status=network_error")
            raise EmailDeliveryError("Could not reach Resend.") from exc
