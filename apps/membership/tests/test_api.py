"""DRF access-control tests for the mobile read API."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.membership.models import Attendance, MemberProfile

User = get_user_model()


class MembershipMeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_me_returns_404_for_profile_less_user(self):
        user = User.objects.create_user(username="noprofile", password="x")
        self.client.force_authenticate(user=user)
        resp = self.client.get("/api/membership/me/")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data, {"detail": "No member profile."})

    def test_me_returns_own_profile(self):
        user = User.objects.create_user(username="withprofile", password="x")
        profile = MemberProfile.objects.create(user=user)
        self.client.force_authenticate(user=user)
        resp = self.client.get("/api/membership/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], profile.pk)


class AttendanceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_attendance_returns_empty_list_for_profile_less_user(self):
        user = User.objects.create_user(username="noprofile2", password="x")
        self.client.force_authenticate(user=user)
        resp = self.client.get("/api/attendance/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(list(resp.data), [])

    def test_member_cannot_read_another_members_attendance(self):
        staff = User.objects.create_user(username="staff", password="x")

        alice = User.objects.create_user(username="alice", password="x")
        alice_profile = MemberProfile.objects.create(user=alice)
        Attendance.objects.create(
            member=alice_profile,
            check_in_at=timezone.now(),
            recorded_by=staff,
        )

        bob = User.objects.create_user(username="bob", password="x")
        MemberProfile.objects.create(user=bob)

        self.client.force_authenticate(user=bob)
        resp = self.client.get("/api/attendance/")
        self.assertEqual(resp.status_code, 200)
        # Bob sees none of Alice's records.
        self.assertEqual(list(resp.data), [])


class MemberCheckInApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="member1", password="x")
        self.profile = MemberProfile.objects.create(
            user=self.user,
            membership_status=MemberProfile.MembershipStatus.ACTIVE,
        )

    def test_member_checkin_creates_attendance(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/member/check-in/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "ok")
        today = timezone.localdate().isoformat()
        self.assertEqual(resp.data["attendance"]["date"], today)
        self.assertTrue(Attendance.objects.filter(member=self.profile).exists())

    def test_member_checkin_idempotent_same_day(self):
        self.client.force_authenticate(user=self.user)
        resp1 = self.client.post("/api/member/check-in/")
        self.assertEqual(resp1.status_code, 200)
        resp2 = self.client.post("/api/member/check-in/")
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(Attendance.objects.filter(member=self.profile).count(), 1)

    def test_member_checkin_inactive_rejected(self):
        self.profile.membership_status = MemberProfile.MembershipStatus.PENDING
        self.profile.save()
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/member/check-in/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not active", resp.data["detail"])

    def test_checkin_persists_in_member_me(self):
        self.client.force_authenticate(user=self.user)
        # Check in via member endpoint
        resp_checkin = self.client.post("/api/member/check-in/")
        self.assertEqual(resp_checkin.status_code, 200)
        # Load member/me
        resp_me = self.client.get("/api/member/me/")
        self.assertEqual(resp_me.status_code, 200)
        self.assertEqual(resp_me.data["streak"], 1)
        self.assertEqual(resp_me.data["weeklyVisits"], 1)
        self.assertEqual(len(resp_me.data["attendance"]), 1)
