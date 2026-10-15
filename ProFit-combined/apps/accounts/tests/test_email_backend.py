"""Email backend tests (design tests 19, 20, 26)."""

import json
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMultiAlternatives
from django.test import TestCase, override_settings

from apps.accounts.email_backends import (
    ResendEmailBackend,
    select_email_backend,
)
from apps.accounts.services import EmailDeliveryError

CONSOLE = "django.core.mail.backends.console.EmailBackend"
RESEND = "apps.accounts.email_backends.ResendEmailBackend"


class SelectBackendTests(TestCase):
    def test_key_set_returns_resend_regardless_of_debug(self):
        self.assertEqual(select_email_backend("re_live_x", False), RESEND)
        self.assertEqual(select_email_backend("re_live_x", True), RESEND)

    def test_no_key_debug_returns_console(self):
        self.assertEqual(select_email_backend("", True), CONSOLE)

    def test_no_key_no_debug_raises(self):
        with self.assertRaises(ImproperlyConfigured):
            select_email_backend("", False)


class _FakeResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def getcode(self):
        return self.status


@override_settings(RESEND_API_KEY="re_live_test")
class ResendBackendTests(TestCase):
    def _message(self):
        msg = EmailMultiAlternatives(
            subject="Your ProFit verification code",
            body="Your verification code is: 123456",
            from_email="ProFit <onboarding@resend.dev>",
            to=["member@example.com"],
        )
        msg.attach_alternative("<p>123456</p>", "text/html")
        return msg

    def test_builds_expected_request_and_no_pii_logged(self):
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["url"] = request.full_url
            captured["headers"] = request.headers
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return _FakeResponse()

        with mock.patch(
            "apps.accounts.email_backends.urllib.request.urlopen", fake_urlopen
        ):
            with self.assertLogs("apps.accounts.email", level="DEBUG") as logs:
                # Emit a probe so assertLogs always has at least one record.
                import logging

                logging.getLogger("apps.accounts.email").debug("probe")
                sent = ResendEmailBackend().send_messages([self._message()])

        self.assertEqual(sent, 1)
        self.assertEqual(captured["url"], "https://api.resend.com/emails")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer re_live_test")
        self.assertEqual(captured["body"]["to"], ["member@example.com"])
        self.assertEqual(captured["body"]["html"], "<p>123456</p>")
        # No recipient/subject/body/code in logs.
        joined = "\n".join(logs.output)
        self.assertNotIn("member@example.com", joined)
        self.assertNotIn("123456", joined)
        self.assertNotIn("verification code", joined)

    def test_network_failure_raises_email_delivery_error(self):
        import urllib.error

        def boom(request, timeout=None):
            raise urllib.error.URLError("down")

        with mock.patch("apps.accounts.email_backends.urllib.request.urlopen", boom):
            with self.assertRaises(EmailDeliveryError):
                ResendEmailBackend().send_messages([self._message()])


class ConsoleBackendUnderTestRunnerTests(TestCase):
    def test_outbox_works_without_key(self):
        from django.core import mail

        mail.send_mail(
            "subject",
            "body",
            "from@example.com",
            ["to@example.com"],
            fail_silently=False,
        )
        self.assertEqual(len(mail.outbox), 1)
