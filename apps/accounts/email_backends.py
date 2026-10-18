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
import urllib.error
import urllib.request

from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger("apps.accounts.email")

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_TIMEOUT = 10


def select_email_backend(resend_api_key: str, debug: bool) -> str:
    """Return the ``EMAIL_BACKEND`` dotted path for the given key presence.

    The console fallback is DEVELOPMENT-ONLY: it writes the full message
    (recipient + OTP code / invite link) to stdout, which Vercel captures as
    function logs. Allowing it when ``DEBUG=False`` would leak the OTP and the
    recipient address to production logs, breaking the "never log PII/OTP"
    guarantee. So an unset key in production is a hard misconfiguration.
    """
    if resend_api_key:
        return "apps.accounts.email_backends.ResendEmailBackend"
    if debug:
        return "django.core.mail.backends.console.EmailBackend"
    raise ImproperlyConfigured(
        "RESEND_API_KEY must be set when DEBUG is False; the console email "
        "backend would leak OTP codes and recipient addresses to logs."
    )


class ResendEmailBackend(BaseEmailBackend):
    """Send mail via Resend's HTTPS API using only the stdlib ``urllib``.

    Reads ``RESEND_API_KEY`` / ``DEFAULT_FROM_EMAIL`` from settings at send time
    (never at import time). On any transport error, timeout, non-2xx response,
    or missing key it logs a non-PII warning and raises ``EmailDeliveryError``
    so the service caller can surface a user-facing error instead of a 500.
    """

    def send_messages(self, email_messages):
        from .services import EmailDeliveryError

        if not email_messages:
            return 0

        from django.conf import settings

        api_key = getattr(settings, "RESEND_API_KEY", "")
        if not api_key:
            logger.warning("event=resend_send_failed status=missing_key")
            raise EmailDeliveryError("Resend API key is not configured.")

        sent = 0
        for message in email_messages:
            self._send_one(message, api_key)
            sent += 1
        return sent

    def _send_one(self, message, api_key):
        from .services import EmailDeliveryError

        payload = {
            "from": message.from_email,
            "to": list(message.to),
            "subject": message.subject,
            "text": message.body,
        }
        # Attach an HTML alternative when one is present.
        for content, mimetype in getattr(message, "alternatives", []) or []:
            if mimetype == "text/html":
                payload["html"] = content
                break

        request = urllib.request.Request(
            RESEND_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
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
            raise EmailDeliveryError("Resend returned an HTTP error.") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.warning("event=resend_send_failed status=network_error")
            raise EmailDeliveryError("Could not reach Resend.") from exc
