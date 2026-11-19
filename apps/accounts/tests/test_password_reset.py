"""Forgot password: emailed code, no account enumeration, one-time use, and Resend OTP."""

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import Client, TestCase
from django.utils import timezone

from apps.accounts.models import EmailOTP, OTPPurpose

User = get_user_model()
OLD, NEW = "Old-pass-123!", "Brand-new-pass-456!"


class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username="r@example.com", email="r@example.com", password=OLD)

    def _post(self, url, body):
        token = self.client.get("/api/auth/csrf/").cookies["csrftoken"].value
        return self.client.post(url, data=json.dumps(body), content_type="application/json", HTTP_X_CSRFTOKEN=token)

    def _request_code(self, email="r@example.com"):
        with mock.patch("apps.accounts.services.send_reset_email") as sent:
            resp = self._post("/api/auth/forgot-password/", {"email": email})
        self.assertEqual(resp.status_code, 200)
        return sent.call_args[0][1] if sent.called else None

    def test_unknown_email_gets_the_same_answer_and_no_mail(self):
        self.assertIsNone(self._request_code("nobody@example.com"))

    def test_code_resets_password_once(self):
        code = self._request_code()
        ok = self._post("/api/auth/reset-password/", {"email": "r@example.com", "code": code, "new_password": NEW})
        self.assertEqual(ok.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW))
        again = self._post("/api/auth/reset-password/", {"email": "r@example.com", "code": code, "new_password": "Another-pass-789!"})
        self.assertEqual(again.status_code, 400)

    def test_wrong_code_and_weak_password_are_rejected(self):
        code = self._request_code()
        wrong = "000000" if code != "000000" else "111111"
        self.assertEqual(self._post("/api/auth/reset-password/", {"email": "r@example.com", "code": wrong, "new_password": NEW}).status_code, 400)
        self.assertEqual(self._post("/api/auth/reset-password/", {"email": "r@example.com", "code": code, "new_password": "123"}).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(OLD))

    def test_resend_otp_api_cooldown_invalidation_and_rate_limit(self):
        code1 = self._request_code()
        # Immediate resend hits 60s cooldown
        too_soon = self._post("/api/auth/resend-otp/", {"email": "r@example.com", "purpose": "PASSWORD_RESET"})
        self.assertEqual(too_soon.status_code, 429)
        self.assertEqual(too_soon.json()["status"], "cooldown")
        self.assertGreaterEqual(too_soon.json()["retry_after"], 1)

        # Age past cooldown -> resend succeeds, invalidates code1, sends code2 by email, never echoes code
        row1 = EmailOTP.objects.filter(user=self.user, purpose=OTPPurpose.PASSWORD_RESET).latest("created_at")
        row1.created_at = timezone.now() - EmailOTP.RESEND_COOLDOWN - timedelta(seconds=1)
        row1.save(update_fields=["created_at"])

        mail.outbox.clear()
        with mock.patch("apps.accounts.services.send_reset_email") as sent:
            ok = self._post("/api/auth/resend-otp/", {"email": "r@example.com", "purpose": "PASSWORD_RESET"})
        self.assertEqual(ok.status_code, 200)
        body = ok.json()
        self.assertEqual(body["status"], "sent")
        self.assertEqual(body["cooldown_seconds"], 60)
        code2 = sent.call_args[0][1]
        self.assertNotIn(code2, json.dumps(body))

        row1.refresh_from_db()
        self.assertTrue(row1.is_consumed())

        # Old code1 can no longer reset the password; new code2 succeeds once
        old_attempt = self._post("/api/auth/reset-password/", {"email": "r@example.com", "code": code1, "new_password": NEW})
        self.assertEqual(old_attempt.status_code, 400)
        good_attempt = self._post("/api/auth/reset-password/", {"email": "r@example.com", "code": code2, "new_password": NEW})
        self.assertEqual(good_attempt.status_code, 200)

        # Anti-enumeration on unknown email
        unknown = self._post("/api/auth/resend-otp/", {"email": "nobody@example.com", "purpose": "PASSWORD_RESET"})
        self.assertEqual(unknown.status_code, 200)

        # Exceeding rolling window cap returns 429 rate_limited
        base = timezone.now() - timedelta(minutes=25)
        existing_rows = list(EmailOTP.objects.filter(user=self.user, purpose=OTPPurpose.PASSWORD_RESET).order_by("created_at"))
        for idx in range(EmailOTP.MAX_RESENDS_PER_WINDOW - len(existing_rows)):
            EmailOTP.objects.create(
                user=self.user,
                code_hash="dummy",
                purpose=OTPPurpose.PASSWORD_RESET,
                created_at=base + timedelta(minutes=idx * 2),
                expires_at=timezone.now() + timedelta(minutes=10),
            )
        for idx, r in enumerate(EmailOTP.objects.filter(user=self.user, purpose=OTPPurpose.PASSWORD_RESET).order_by("created_at")):
            r.created_at = base + timedelta(minutes=idx * 2)
            r.save(update_fields=["created_at"])

        capped = self._post("/api/auth/resend-otp/", {"email": "r@example.com", "purpose": "PASSWORD_RESET"})
        self.assertEqual(capped.status_code, 429)
        self.assertEqual(capped.json()["status"], "rate_limited")

    def test_forgot_password_surfaces_503_on_delivery_failure_and_allows_retry(self):
        from apps.accounts.services import EmailDeliveryError

        with mock.patch("apps.accounts.services.send_reset_email", side_effect=EmailDeliveryError("down")):
            err_resp = self._post("/api/auth/forgot-password/", {"email": "r@example.com"})
        self.assertEqual(err_resp.status_code, 503)
        self.assertEqual(err_resp.json()["status"], "send_failed")
        self.assertEqual(EmailOTP.objects.filter(user=self.user, purpose=OTPPurpose.PASSWORD_RESET).count(), 0)

        # Immediate retry once email service recovers succeeds without cooldown lockout
        code = self._request_code()
        self.assertIsNotNone(code)
        self.assertEqual(
            self._post("/api/auth/reset-password/", {"email": "r@example.com", "code": f" {code} ", "new_password": NEW}).status_code,
            200,
        )
