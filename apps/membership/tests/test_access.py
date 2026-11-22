"""Server-side trial/membership access: trial is profile-only, expiry is request-time."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.membership.models import Attendance, MemberProfile
from apps.membership.services import enroll_member, start_trial

User = get_user_model()

FEATURE_URLS = (
    "/api/attendance/",
    "/api/announcements/",
    "/api/notifications/",
    "/api/trainer/me/",
)


class _MemberFixture(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="cashier", password="x", role="CASHIER")
        self.user = User.objects.create_user(
            username="trial@example.com",
            email="trial@example.com",
            password="Password123!",
            role="MEMBER",
        )
        self.profile = MemberProfile.objects.create(user=self.user)
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.web = Client()


class MemberApiAccessTests(_MemberFixture):
    def test_active_trial_can_read_only_own_profile(self):
        start_trial(self.profile)

        res = self.api.get("/api/member/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["membership"]["status"], "TRIAL")
        self.assertEqual(self.api.get("/api/membership/me/").status_code, 200)

        for url in FEATURE_URLS:
            res = self.api.get(url)
            self.assertEqual(res.status_code, 403, url)
            self.assertIn("profile only", str(res.data["detail"]))

        self.assertEqual(self.api.post("/api/member/check-in/").status_code, 403)
        self.assertEqual(Attendance.objects.count(), 0)

    def test_expired_trial_has_no_features_and_nothing_is_written(self):
        start_trial(self.profile, now=timezone.now() - timedelta(days=8))

        # Restricted portal profile read stays accessible so the member can view status/renew
        res = self.api.get("/api/member/me/")
        self.assertEqual(res.status_code, 200)

        for url in FEATURE_URLS:
            f_res = self.api.get(url)
            self.assertEqual(f_res.status_code, 403, url)
            self.assertIn("free trial has ended", str(f_res.data["detail"]))
        self.assertEqual(self.api.post("/api/member/check-in/").status_code, 403)
        self.assertEqual(Attendance.objects.count(), 0)

        self.user.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertEqual(self.profile.membership_status, "TRIAL")

    def test_expiry_is_computed_on_each_request(self):
        start_trial(self.profile)
        self.assertEqual(self.api.get("/api/member/me/").status_code, 200)

        # No status write, no cron: changing the stored end immediately blocks gym features.
        self.profile.trial_ends_at = timezone.now() - timedelta(days=1)
        self.profile.save(update_fields=["trial_ends_at"])
        self.assertEqual(self.api.get("/api/attendance/").status_code, 403)
        self.assertIn("free trial has ended", str(self.api.get("/api/attendance/").data["detail"]))

    def test_active_membership_gets_member_features(self):
        today = timezone.localdate()
        enroll_member(
            self.profile, today - timedelta(days=1), today + timedelta(days=30),
            created_by=self.staff,
        )

        res = self.api.get("/api/member/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["membership"]["status"], "ACTIVE")
        for url in FEATURE_URLS:
            self.assertEqual(self.api.get(url).status_code, 200, url)
        self.assertEqual(self.api.post("/api/member/check-in/").status_code, 200)
        self.assertEqual(Attendance.objects.count(), 1)

    def test_staff_are_unaffected(self):
        api = APIClient()
        api.force_authenticate(self.staff)
        self.assertEqual(api.get("/api/notifications/").status_code, 200)
        self.assertEqual(api.get("/api/announcements/").status_code, 200)


class MemberPageAccessTests(_MemberFixture):
    def test_locked_member_can_open_portal_but_restricted_pages_are_blocked(self):
        start_trial(self.profile, now=timezone.now() - timedelta(days=8))
        self.web.force_login(self.user)

        self.assertEqual(self.web.get("/member-home").status_code, 200)
        self.assertEqual(self.web.get("/profile").status_code, 200)
        res = self.web.get("/payments")
        self.assertEqual(res.status_code, 403)
        self.assertIn(b"free trial has ended", res.content)

    def test_trial_member_can_open_profile_pages_only(self):
        start_trial(self.profile)
        self.web.force_login(self.user)

        self.assertEqual(self.web.get("/member-home").status_code, 200)
        self.assertEqual(self.web.get("/profile").status_code, 200)
        res = self.web.get("/payments")
        self.assertEqual(res.status_code, 403)
        self.assertIn(b"profile only", res.content)

    def test_active_member_pages_are_unchanged(self):
        today = timezone.localdate()
        enroll_member(
            self.profile, today - timedelta(days=1), today + timedelta(days=30),
            created_by=self.staff,
        )
        self.web.force_login(self.user)
        self.assertEqual(self.web.get("/member-home").status_code, 200)
