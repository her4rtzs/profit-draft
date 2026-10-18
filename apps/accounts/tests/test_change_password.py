"""POST /api/auth/change-password/ for every role."""

import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

User = get_user_model()
URL = "/api/auth/change-password/"


class ChangePasswordTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def _token(self):
        return self.client.get("/api/auth/csrf/").cookies["csrftoken"].value

    def _login(self, user, password):
        resp = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"username": user.username, "password": password}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self._token(),
        )
        self.assertEqual(resp.status_code, 200)

    def _change(self, current, new):
        return self.client.post(
            URL,
            data=json.dumps({"current_password": current, "new_password": new}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self._token(),
        )

    def test_every_role_can_change_own_password(self):
        for role in ("OWNER", "CASHIER", "TRAINER", "MEMBER"):
            with self.subTest(role=role):
                self.client = Client(enforce_csrf_checks=True)
                user = User.objects.create_user(
                    username=f"{role.lower()}@example.com", password="Old-pass-4821", role=role
                )
                self._login(user, "Old-pass-4821")
                resp = self._change("Old-pass-4821", "Brand-new-7392")
                self.assertEqual(resp.status_code, 200)
                user.refresh_from_db()
                self.assertTrue(user.check_password("Brand-new-7392"))
                # The session survives the change.
                self.assertEqual(self.client.get("/api/auth/session/").status_code, 200)

    def test_requires_sign_in(self):
        self.assertEqual(self._change("a", "b").status_code, 401)

    def test_wrong_current_password_is_400_and_changes_nothing(self):
        user = User.objects.create_user(username="m@example.com", password="Old-pass-4821", role="MEMBER")
        self._login(user, "Old-pass-4821")
        resp = self._change("not-the-password", "Brand-new-7392")
        self.assertEqual(resp.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Old-pass-4821"))

    def test_weak_or_unchanged_password_is_rejected(self):
        user = User.objects.create_user(username="m@example.com", password="Old-pass-4821", role="MEMBER")
        self._login(user, "Old-pass-4821")
        self.assertEqual(self._change("Old-pass-4821", "short").status_code, 400)
        self.assertEqual(self._change("Old-pass-4821", "12345678").status_code, 400)
        self.assertEqual(self._change("Old-pass-4821", "Old-pass-4821").status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Old-pass-4821"))

    def test_csrf_is_enforced(self):
        user = User.objects.create_user(username="m@example.com", password="Old-pass-4821", role="MEMBER")
        self._login(user, "Old-pass-4821")
        resp = self.client.post(
            URL,
            data=json.dumps({"current_password": "Old-pass-4821", "new_password": "Brand-new-7392"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)
