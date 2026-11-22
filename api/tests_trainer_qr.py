"""Tests for Trainer QR code attendance check-in."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.membership.models import Attendance, MemberProfile

User = get_user_model()


class TrainerQrCheckInTests(TestCase):
    def setUp(self):
        self.trainer = User.objects.create_user(
            username="trainer_qr",
            email="trainer_qr@example.com",
            password="Password123!",
            first_name="Coach",
            last_name="Joyce",
            role=Role.TRAINER,
        )
        self.member_user = User.objects.create_user(
            username="member_qr",
            email="member_qr@example.com",
            password="Password123!",
            first_name="Ana",
            last_name="Santos",
            role=Role.MEMBER,
        )
        today = timezone.localdate()
        self.member = MemberProfile.objects.create(
            user=self.member_user,
            membership_status=MemberProfile.MembershipStatus.ACTIVE,
            expiry_date=today + timedelta(days=30),
        )
        self.client = APIClient()

    def test_trainer_can_check_in_active_member_via_qr_code(self):
        self.client.force_authenticate(user=self.trainer)
        qr_payload = f"PROFIT:M{202600 + self.member.pk}"

        res = self.client.post(
            "/api/trainer/attendance/check-in/",
            {"qr_code": qr_payload},
            format="json",
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["member_id"], self.member.pk)
        self.assertTrue(
            Attendance.objects.filter(
                member=self.member,
                check_in_date=timezone.localdate(),
                recorded_by=self.trainer,
            ).exists()
        )

    def test_member_role_cannot_use_trainer_qr_checkin(self):
        self.client.force_authenticate(user=self.member_user)
        qr_payload = f"PROFIT:M{202600 + self.member.pk}"

        res = self.client.post(
            "/api/trainer/attendance/check-in/",
            {"qr_code": qr_payload},
            format="json",
        )

        self.assertEqual(res.status_code, 403)

    def test_invalid_qr_code_returns_400(self):
        self.client.force_authenticate(user=self.trainer)

        res = self.client.post(
            "/api/trainer/attendance/check-in/",
            {"qr_code": "INVALID-CODE"},
            format="json",
        )

        self.assertEqual(res.status_code, 400)

    def test_expired_member_qr_rejected(self):
        self.member.membership_status = MemberProfile.MembershipStatus.EXPIRED
        self.member.expiry_date = timezone.localdate() - timedelta(days=2)
        self.member.save(update_fields=["membership_status", "expiry_date"])

        self.client.force_authenticate(user=self.trainer)
        qr_payload = f"PROFIT:M{202600 + self.member.pk}"

        res = self.client.post(
            "/api/trainer/attendance/check-in/",
            {"qr_code": qr_payload},
            format="json",
        )

        self.assertEqual(res.status_code, 400)
