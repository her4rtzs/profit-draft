"""Tests for the per-user Settings Activity Log endpoint."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.announcements.models import Announcement
from apps.billing.models import PaymentClaim
from apps.membership.models import Attendance, Enrollment, MemberProfile
from apps.notifications.models import Notification

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"


class ActivityLogTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner_act@gym.test",
            email="owner_act@gym.test",
            password=PASSWORD,
            role="OWNER",
            first_name="Alex",
            last_name="Owner",
        )
        self.m1_user = User.objects.create_user(
            username="m1_act@gym.test",
            email="m1_act@gym.test",
            password=PASSWORD,
            role="MEMBER",
            first_name="Ana",
            last_name="Santos",
        )
        self.m2_user = User.objects.create_user(
            username="m2_act@gym.test",
            email="m2_act@gym.test",
            password=PASSWORD,
            role="MEMBER",
            first_name="Ben",
            last_name="Cruz",
        )
        self.m1 = MemberProfile.objects.create(user=self.m1_user, membership_status="ACTIVE")
        self.m2 = MemberProfile.objects.create(user=self.m2_user, membership_status="ACTIVE")

    def test_requires_authenticated_active_user(self):
        anon = self.client.get("/api/auth/activity/")
        self.assertEqual(anon.status_code, 401)

        self.client.force_login(self.m1_user)
        self.m1_user.is_active = False
        self.m1_user.save(update_fields=["is_active"])
        inactive = self.client.get("/api/auth/activity/")
        self.assertIn(inactive.status_code, (401, 403))

    def test_member_sees_only_own_activity_and_sorted_newest_first(self):
        today = timezone.localdate()
        Attendance.objects.create(member=self.m1, recorded_by=self.owner)
        Attendance.objects.create(member=self.m2, recorded_by=self.owner)
        PaymentClaim.objects.create(
            member=self.m1,
            plan="monthly",
            amount_centavos=80000,
            reference_number="1234567890",
            proof_link="https://drive.google.com/file/d/own/view",
        )
        PaymentClaim.objects.create(
            member=self.m2,
            plan="annual",
            amount_centavos=750000,
            reference_number="9999999999",
            proof_link="https://drive.google.com/file/d/other/view",
        )
        Notification.objects.create(recipient=self.m1_user, title="Welcome Ana", body="Your pass is ready")
        Notification.objects.create(recipient=self.m2_user, title="Secret Ben notice", body="Only for Ben")

        self.client.force_login(self.m1_user)
        res = self.client.get("/api/auth/activity/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn("counts", body)
        self.assertIn("items", body)
        self.assertEqual(body["today"], today.isoformat())

        titles = " ".join(item["title"] for item in body["items"])
        details = " ".join(item["detail"] for item in body["items"])
        self.assertIn("Welcome Ana", titles)
        self.assertIn("1234567890", details)
        self.assertNotIn("Secret Ben notice", titles)
        self.assertNotIn("9999999999", details)
        self.assertNotIn("drive.google.com", details)

        timestamps = [item["at"] for item in body["items"]]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))
        self.assertEqual(
            body["counts"]["all"],
            body["counts"]["security"] + body["counts"]["actions"] + body["counts"]["updates"],
        )

    def test_owner_sees_enrollments_claim_reviews_and_announcements(self):
        today = timezone.localdate()
        Enrollment.objects.create(
            member=self.m1,
            start_date=today,
            end_date=today + timedelta(days=30),
            created_by=self.owner,
        )
        PaymentClaim.objects.create(
            member=self.m1,
            plan="monthly",
            amount_centavos=80000,
            reference_number="5555666677",
            proof_link="https://drive.google.com/file/d/sample/view",
            status=PaymentClaim.Status.APPROVED,
            reviewed_by=self.owner,
            reviewed_at=timezone.now(),
        )
        Announcement.objects.create(
            title="Holiday Schedule Update",
            message="Gym opens at 8 AM.",
            created_by=self.owner,
        )

        self.client.force_login(self.owner)
        res = self.client.get("/api/auth/activity/")
        self.assertEqual(res.status_code, 200)
        items = res.json()["items"]
        titles = " | ".join(i["title"] for i in items)
        self.assertIn("Enrolled Ana Santos", titles)
        self.assertIn("Confirmed GCash payment for Ana Santos", titles)
        self.assertIn("Created announcement: Holiday Schedule Update", titles)
        self.assertGreaterEqual(res.json()["counts"]["security"], 1)
