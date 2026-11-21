"""Dashboard totals include approved claims, desk payments and old PayMongo rows only."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing.models import Payment, PaymentClaim, Subscription
from apps.finance.models import ManualPayment
from apps.membership.models import MemberProfile

User = get_user_model()


class ClaimDashboardTests(TestCase):
    def setUp(self):
        owner = User.objects.create_user(username="owner@example.com", password="x", role="OWNER")
        member_user = User.objects.create_user(username="member@example.com", password="x", role="MEMBER")
        self.member = MemberProfile.objects.create(user=member_user)
        self.api = APIClient()
        self.api.force_authenticate(owner)
        self.today = timezone.localdate()

        ManualPayment.objects.create(
            member=self.member, plan="monthly", method=ManualPayment.Method.CASH,
            amount_centavos=80_000, paid_on=self.today, recorded_by=owner,
        )
        sub = Subscription.objects.create(
            member=self.member, plan="monthly", amount_centavos=80_000,
            status=Subscription.Status.ACTIVE,
        )
        Payment.objects.create(
            subscription=sub, amount_centavos=80_000,
            status=Payment.Status.PAID, paymongo_payment_id="pi_old_history_1",
        )

        self._claim("09171230001", PaymentClaim.Status.APPROVED)
        self._claim("09171230002", PaymentClaim.Status.PENDING_REVIEW)
        self._claim("09171230003", PaymentClaim.Status.REJECTED)

    def _claim(self, reference, status):
        return PaymentClaim.objects.create(
            member=self.member, amount_centavos=210_000,
            reference_number=reference,
            proof_link="https://drive.google.com/file/d/abc/view",
            status=status,
            reviewed_at=timezone.now() if status != PaymentClaim.Status.PENDING_REVIEW else None,
        )

    def test_monthly_summary_counts_only_settled_rows(self):
        res = self.api.get(
            "/api/staff/reports/summary/",
            {"year": self.today.year, "month": self.today.month},
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["desk_centavos"], 80_000)
        self.assertEqual(body["claim_centavos"], 210_000)
        self.assertEqual(body["online_centavos"], 80_000)
        self.assertEqual(body["total_centavos"], 370_000)
        self.assertEqual(body["payment_count"], 3)
        self.assertEqual(
            body["by_method"], {"CASH": 80_000, "GCASH": 210_000, "ONLINE": 80_000}
        )

    def test_revenue_analytics_includes_approved_claims(self):
        res = self.api.get(
            "/api/staff/reports/revenue/", {"period": "month", "year": self.today.year}
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["total"], 3700.0)

    def test_cashier_overview_includes_approved_claims(self):
        res = self.api.get("/api/staff/cashier/overview/")
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["collected_today_centavos"], 370_000)
        self.assertEqual(body["payments_today_count"], 3)
        self.assertEqual(
            body["by_method_centavos"],
            {"CASH": 80_000, "GCASH": 210_000, "ONLINE": 80_000},
        )
