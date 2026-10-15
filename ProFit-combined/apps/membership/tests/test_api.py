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
