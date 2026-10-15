"""Session + CSRF auth-endpoint tests backing the mobile binding sequence.

Verifies the four-step contract the React Native client relies on:
  1. GET /api/auth/csrf/ sets the ``csrftoken`` cookie.
  2. POST /api/auth/login/ is CSRF-protected (403 without the token; 200 with
     the echoed token) — there is NO CSRF-exempt login endpoint.
  3. an authenticated session can then read /api/membership/me/ and
     /api/attendance/.
"""

import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.membership.models import MemberProfile

User = get_user_model()


class SessionAuthFlowTests(TestCase):
    def setUp(self):
        # enforce_csrf_checks=True makes the test client behave like a real
        # browser/mobile client: the CSRF token must be supplied on POST.
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username="member1", password="pw-secret")
        MemberProfile.objects.create(user=self.user)

    def _csrf_token(self):
        resp = self.client.get("/api/auth/csrf/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("csrftoken", resp.cookies)
        return resp.cookies["csrftoken"].value

    def test_login_without_csrf_token_is_forbidden(self):
        self._csrf_token()  # cookie is set, but we deliberately omit the header
        resp = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "member1", "password": "pw-secret"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_full_sequence_logs_in_and_reads_member_data(self):
        token = self._csrf_token()
        resp = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "member1", "password": "pw-secret"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200)

        me = self.client.get("/api/membership/me/")
        self.assertEqual(me.status_code, 200)

        attendance = self.client.get("/api/attendance/")
        self.assertEqual(attendance.status_code, 200)

    def test_bad_credentials_are_401(self):
        token = self._csrf_token()
        resp = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "member1", "password": "wrong"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 401)

    def test_malformed_body_is_400(self):
        token = self._csrf_token()
        resp = self.client.post(
            "/api/auth/login/",
            data=b"not json",
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 400)

    def test_login_only_accepts_post(self):
        resp = self.client.get("/api/auth/login/")
        self.assertEqual(resp.status_code, 405)
