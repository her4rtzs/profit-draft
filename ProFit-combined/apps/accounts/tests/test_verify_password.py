"""POST /api/auth/verify-password/ checks the current password only."""

import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

User = get_user_model()


class VerifyPasswordTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username="v@example.com", password="Old-pass-123!")

    def _token(self):
        return self.client.get("/api/auth/csrf/").cookies["csrftoken"].value

    def _post(self, url, body):
        return self.client.post(url, data=json.dumps(body), content_type="application/json", HTTP_X_CSRFTOKEN=self._token())

    def test_requires_login(self):
        self.assertEqual(self._post("/api/auth/verify-password/", {"current_password": "x"}).status_code, 401)

    def test_wrong_then_right_password(self):
        self._post("/api/auth/login/", {"username": "v@example.com", "password": "Old-pass-123!"})
        self.assertEqual(self._post("/api/auth/verify-password/", {"current_password": "nope"}).status_code, 400)
        self.assertEqual(self._post("/api/auth/verify-password/", {"current_password": "Old-pass-123!"}).status_code, 200)
