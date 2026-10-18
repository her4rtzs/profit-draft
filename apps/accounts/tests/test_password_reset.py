"""Forgot password: emailed code, no account enumeration, one-time use."""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

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
