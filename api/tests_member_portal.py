"""Targeted tests for the upgraded ProFit Member Portal API & renewal rules."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.billing.models import Payment, Subscription
from apps.billing.services import activate_paid_payment, mark_payment_paid
from apps.membership.models import Attendance, Enrollment, MemberProfile
from apps.membership.services import enroll_member

User = get_user_model()

PLAN_AMOUNTS = {
    "daily": 8000,
    "monthly": 80000,
    "quarterly": 210000,
    "annual": 750000,
}


class MemberPortalApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="member_portal_1",
            email="portal1@profit.test",
            password="Password123!",
            first_name="Joyce",
            last_name="Member",
            role=Role.MEMBER,
        )
        self.profile = MemberProfile.objects.create(
            user=self.user,
            membership_status=MemberProfile.MembershipStatus.PENDING,
        )
        self.other_user = User.objects.create_user(
            username="member_portal_2",
            email="portal2@profit.test",
            password="Password123!",
            role=Role.MEMBER,
        )
        self.other_profile = MemberProfile.objects.create(
            user=self.other_user,
            membership_status=MemberProfile.MembershipStatus.ACTIVE,
            expiry_date=timezone.localdate() + timedelta(days=20),
        )

    def test_member_me_requires_authentication(self):
        res = self.client.get("/api/member/me/")
        self.assertIn(res.status_code, (401, 403))

    def test_active_membership_returns_real_plan_dates_and_scoped_records(self):
        today = timezone.localdate()
        enroll_member(self.profile, start_date=today, end_date=today + timedelta(days=90), created_by=self.user)
        sub = Subscription.objects.create(
            member=self.profile,
            plan="quarterly",
            amount_centavos=PLAN_AMOUNTS["quarterly"],
            status=Subscription.Status.ACTIVE,
        )
        Payment.objects.create(
            subscription=sub,
            amount_centavos=sub.amount_centavos,
            status=Payment.Status.PAID,
            paymongo_payment_id="pi_test_active_1",
        )
        # Other member's payment & attendance must never leak
        other_sub = Subscription.objects.create(
            member=self.other_profile,
            plan="annual",
            amount_centavos=PLAN_AMOUNTS["annual"],
            status=Subscription.Status.ACTIVE,
        )
        Payment.objects.create(
            subscription=other_sub,
            amount_centavos=other_sub.amount_centavos,
            status=Payment.Status.PAID,
            paymongo_payment_id="pi_other_1",
        )
        Attendance.objects.create(
            member=self.other_profile,
            check_in_date=today,
            recorded_by=self.other_user,
        )

        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/member/me/")
        self.assertEqual(res.status_code, 200)
        m = res.data["membership"]
        self.assertEqual(m["plan"], "quarterly")
        self.assertEqual(m["planName"], "Quarterly")
        self.assertEqual(m["durationDays"], 90)
        self.assertEqual(m["remainingDays"], 90)
        self.assertEqual(m["status"], "ACTIVE")
        self.assertEqual(m["paymentStatus"], Payment.Status.PAID)
        self.assertEqual(m["startDate"], today.isoformat())
        self.assertEqual(m["endDate"], (today + timedelta(days=90)).isoformat())
        self.assertEqual(len(res.data["payments"]), 1)
        self.assertEqual(len(res.data["attendance"]), 0)

    def test_expired_membership_clamps_remaining_days_to_zero(self):
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        self.profile.membership_status = MemberProfile.MembershipStatus.ACTIVE
        self.profile.expiry_date = yesterday
        self.profile.save()
        Enrollment.objects.create(
            member=self.profile,
            start_date=today - timedelta(days=31),
            end_date=yesterday,
            created_by=self.user,
        )

        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/member/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["membership"]["remainingDays"], 0)
        self.assertEqual(res.data["membership"]["status"], "EXPIRED")

    def test_expiring_soon_membership_flags_within_seven_days(self):
        today = timezone.localdate()
        self.profile.membership_status = MemberProfile.MembershipStatus.ACTIVE
        self.profile.expiry_date = today + timedelta(days=3)
        self.profile.save()

        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/member/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["membership"]["remainingDays"], 3)
        self.assertEqual(res.data["membership"]["status"], "EXPIRING_SOON")
        self.assertTrue(res.data["membership"]["expiringSoon"])

    def test_pending_and_failed_payments_appear_in_history(self):
        sub = Subscription.objects.create(
            member=self.profile,
            plan="monthly",
            amount_centavos=PLAN_AMOUNTS["monthly"],
            status=Subscription.Status.PENDING,
        )
        Payment.objects.create(
            subscription=sub,
            amount_centavos=sub.amount_centavos,
            status=Payment.Status.FAILED,
            paymongo_payment_id="pi_failed_1",
        )
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/member/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["membership"]["status"], "PENDING")
        self.assertEqual(res.data["membership"]["paymentStatus"], Payment.Status.FAILED)
        self.assertEqual(res.data["payments"][0]["status"], Payment.Status.FAILED)

    def test_renewal_extends_from_existing_expiry_and_is_idempotent(self):
        today = timezone.localdate()
        current_expiry = today + timedelta(days=10)
        self.profile.membership_status = MemberProfile.MembershipStatus.ACTIVE
        self.profile.expiry_date = current_expiry
        self.profile.save()

        sub = Subscription.objects.create(
            member=self.profile,
            plan="monthly",
            amount_centavos=PLAN_AMOUNTS["monthly"],
            status=Subscription.Status.PENDING,
        )
        payment = Payment.objects.create(
            subscription=sub,
            amount_centavos=sub.amount_centavos,
            status=Payment.Status.PENDING,
            paymongo_payment_id="pi_renew_idemp_1",
        )

        activate_paid_payment(payment)
        self.profile.refresh_from_db()
        expected = current_expiry + timedelta(days=30)
        self.assertEqual(self.profile.expiry_date, expected)

        # Duplicate webhook delivery must not extend again
        mark_payment_paid(payment)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.expiry_date, expected)
