"""Tests for the web-app session endpoints and the member home payload."""

import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.membership.models import MemberProfile
from apps.membership.services import record_attendance


class WebSessionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.member = User.objects.create_user(
            username="ana", email="ana@example.com", password="pw-secret-1",
            role="MEMBER", first_name="Ana",
        )
        User.objects.create_user(
            username="owner1", email="owner@example.com", password="pw-secret-1", role="OWNER",
        )
        self.profile = MemberProfile.objects.create(user=self.member, membership_status="ACTIVE")

    def _login(self, identity, password="pw-secret-1"):
        return self.client.post(
            "/api/auth/login/",
            data=json.dumps({"identity": identity, "password": password}),
            content_type="application/json",
        )

    def test_session_is_401_when_anonymous(self):
        self.assertEqual(self.client.get("/api/auth/session/").status_code, 401)

    def test_login_accepts_email_and_session_reports_member_role(self):
        self.assertEqual(self._login("ANA@example.com").status_code, 200)
        body = self.client.get("/api/auth/session/").json()
        self.assertEqual(body["user"]["role"], "MEMBER")
        self.assertEqual(body["user"]["name"], "Ana")

    def test_owner_maps_to_admin_role(self):
        self.assertEqual(self._login("owner1").status_code, 200)
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["role"], "ADMIN")

    def test_wrong_password_is_rejected(self):
        self.assertEqual(self._login("ana", "nope").status_code, 401)

    def test_member_me_returns_own_profile_and_visits(self):
        record_attendance(self.profile, recorded_by=self.member)
        self._login("ana")
        body = self.client.get("/api/member/me/").json()
        self.assertEqual(body["membership"]["status"], "ACTIVE")
        self.assertEqual(len(body["attendance"]), 1)
        self.assertEqual(body["payments"], [])

    def test_staff_without_member_profile_gets_404(self):
        self._login("owner1")
        self.assertEqual(self.client.get("/api/member/me/").status_code, 404)
