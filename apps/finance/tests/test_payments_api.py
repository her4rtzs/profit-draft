"""Phase 2: desk payments, renewal from a payment, and the owner's monthly summary."""

import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.finance.models import ManualPayment
from apps.membership.models import MemberProfile

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"
PAY = "/api/staff/payments/"
SUMMARY = "/api/staff/reports/summary/"


class DeskPaymentTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = self._user("owner@gym.test", "OWNER")
        self.cashier = self._user("cash@gym.test", "CASHIER")
        self.trainer = self._user("coach@gym.test", "TRAINER")
        self.member_user = self._user("mem@gym.test", "MEMBER")
        self.member = MemberProfile.objects.create(
            user=self.member_user,
            membership_status=MemberProfile.MembershipStatus.PENDING,
        )

    def _user(self, email, role):
        return User.objects.create_user(username=email, email=email, password=PASSWORD, role=role)

    def as_(self, user):
        self.api.force_authenticate(user=user)

    def pay(self, plan="monthly", method="CASH", member=None, reference=None):
        body = {"member_id": (member or self.member).pk, "plan": plan, "method": method}
        if method == "GCASH":
            body["reference_number"] = reference or "0917 123 4567"
        return self.api.post(PAY, body, format="json")

    def test_first_payment_activates_membership_at_correct_price(self):
        self.as_(self.owner)
        res = self.pay("monthly", "CASH")
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["payment"]["amount_centavos"], 80_000)
        self.assertEqual(body["payment"]["ref"], f"P-{body['payment']['id']:05d}")
        self.assertEqual(body["member"]["membership_status"], "ACTIVE")
        self.member.refresh_from_db()
        self.assertEqual(self.member.expiry_date, timezone.localdate() + datetime.timedelta(days=30))

    def test_renewal_stacks_on_remaining_days(self):
        today = timezone.localdate()
        self.member.membership_status = MemberProfile.MembershipStatus.ACTIVE
        self.member.expiry_date = today + datetime.timedelta(days=10)
        self.member.save(update_fields=["membership_status", "expiry_date"])
        self.as_(self.cashier)
        res = self.pay("quarterly", "GCASH")
        self.assertEqual(res.status_code, 201, res.content)
        self.member.refresh_from_db()
        self.assertEqual(self.member.expiry_date, today + datetime.timedelta(days=100))

    def test_trainer_and_member_cannot_record_payments(self):
        for user in (self.trainer, self.member_user):
            self.as_(user)
            self.assertEqual(self.pay().status_code, 403)
        self.assertFalse(ManualPayment.objects.exists())

    def test_unknown_method_and_plan_are_rejected(self):
        self.as_(self.owner)
        self.assertEqual(self.pay(method="CRYPTO").status_code, 400)
        self.assertEqual(self.pay(plan="weekly").status_code, 400)
        self.assertFalse(ManualPayment.objects.exists())

    def test_list_filters_by_member(self):
        self.as_(self.owner)
        self.assertEqual(self.pay().status_code, 201)
        res = self.api.get(PAY, {"member": self.member.pk})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(self.api.get(PAY, {"member": "abc"}).status_code, 400)

    def test_summary_is_owner_only_and_totals_desk_payments(self):
        self.as_(self.owner)
        self.assertEqual(self.pay("monthly", "CASH").status_code, 201)
        self.assertEqual(self.pay("annual", "GCASH").status_code, 201)
        today = timezone.localdate()
        res = self.api.get(SUMMARY, {"year": today.year, "month": today.month})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["desk_centavos"], 80_000 + 750_000)
        self.assertEqual(body["online_centavos"], 0)
        self.assertEqual(body["total_centavos"], 830_000)
        self.assertEqual(body["payment_count"], 2)
        self.assertEqual(body["by_method"], {"CASH": 80_000, "GCASH": 750_000})
        self.assertEqual(body["by_plan"], {"monthly": 80_000, "annual": 750_000})

        self.as_(self.cashier)
        self.assertEqual(self.api.get(SUMMARY).status_code, 403)

    def test_summary_rejects_bad_month(self):
        self.as_(self.owner)
        self.assertEqual(self.api.get(SUMMARY, {"month": 13}).status_code, 400)

    def test_revenue_analytics_endpoint(self):
        self.as_(self.owner)
        self.assertEqual(self.pay("monthly", "CASH").status_code, 201)
        self.assertEqual(self.pay("annual", "GCASH").status_code, 201)
        today = timezone.localdate()

        # Month
        res = self.api.get("/api/staff/reports/revenue/", {"period": "month", "year": today.year})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["period"], "month")
        self.assertEqual(len(data["buckets"]), 12)
        self.assertEqual(data["total"], 8300.0)  # (80000 + 750000) / 100
        self.assertFalse(data["empty"])

        # Year
        res_y = self.api.get("/api/staff/reports/revenue/", {"period": "year", "year": today.year})
        self.assertEqual(res_y.status_code, 200)
        data_y = res_y.json()
        self.assertEqual(data_y["period"], "year")
        self.assertEqual(len(data_y["buckets"]), 5)
        self.assertEqual(data_y["total"], 8300.0)

        # Cashier is 403
        self.as_(self.cashier)
        self.assertEqual(self.api.get("/api/staff/reports/revenue/").status_code, 403)

    def test_cashier_overview_and_rbac(self):
        # Give self.member an expiring date within the 7-day due window so renewals_due_count >= 1
        self.member.membership_status = MemberProfile.MembershipStatus.EXPIRED
        self.member.expiry_date = timezone.localdate() - datetime.timedelta(days=1)
        self.member.save(update_fields=["membership_status", "expiry_date"])

        # Trainer and Member cannot access cashier overview or record payments
        for blocked_user in (self.trainer, self.member_user):
            self.as_(blocked_user)
            self.assertEqual(self.api.get("/api/staff/cashier/overview/").status_code, 403)
            self.assertEqual(self.pay(plan="monthly", method="CASH").status_code, 403)

        # Owner can also read cashier overview
        self.as_(self.owner)
        owner_res = self.api.get("/api/staff/cashier/overview/")
        self.assertEqual(owner_res.status_code, 200)

        # Cashier reads initial shift overview
        self.as_(self.cashier)
        before_res = self.api.get("/api/staff/cashier/overview/")
        self.assertEqual(before_res.status_code, 200)
        before = before_res.json()
        for key in (
            "collected_today_centavos",
            "payments_today_count",
            "by_method_centavos",
            "checkins_today_count",
            "renewals_due_count",
            "recent_payments",
        ):
            self.assertIn(key, before)
        self.assertGreaterEqual(before["renewals_due_count"], 1)

        # Cashier records a desk payment via POST /api/staff/payments/
        pay_res = self.pay(plan="monthly", method="CASH")
        self.assertEqual(pay_res.status_code, 201)
        payment_data = pay_res.json()["payment"]

        after = self.api.get("/api/staff/cashier/overview/").json()
        self.assertEqual(after["collected_today_centavos"], before["collected_today_centavos"] + 80000)
        self.assertEqual(after["payments_today_count"], before["payments_today_count"] + 1)
        self.assertEqual(
            after["by_method_centavos"]["CASH"],
            before["by_method_centavos"]["CASH"] + 80000,
        )
        self.assertEqual(after["renewals_due_count"], before["renewals_due_count"] - 1)
        self.assertTrue(any(row["ref"] == payment_data["ref"] for row in after["recent_payments"]))

        # Cashier is denied Owner-only operations (edit/delete payments, trainers, announcements)
        pid = payment_data["id"]
        self.assertEqual(
            self.api.patch(f"/api/staff/payments/{pid}/", {"method": "GCASH", "reference_number": "0917 123 4567"}, format="json").status_code,
            403,
        )
        self.assertEqual(self.api.delete(f"/api/staff/payments/{pid}/").status_code, 403)
        self.assertEqual(self.api.get("/api/staff/trainers/").status_code, 403)
        self.assertEqual(self.api.get("/api/staff/announcements/").status_code, 403)

    def test_gcash_requires_and_normalises_reference(self):
        self.as_(self.owner)
        no_ref = self.api.post(
            PAY,
            {"member_id": self.member.pk, "plan": "monthly", "method": "GCASH"},
            format="json",
        )
        self.assertEqual(no_ref.status_code, 400)

        res = self.pay("monthly", "GCASH", reference="0917 123 4567")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(ManualPayment.objects.get().reference_number, "09171234567")

    def test_duplicate_gcash_reference_is_rejected(self):
        self.as_(self.owner)
        self.assertEqual(
            self.pay("monthly", "GCASH", reference="0917 123 4567").status_code, 201
        )
        res = self.pay("quarterly", "GCASH", reference="09171234567")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(ManualPayment.objects.count(), 1)

    def test_bank_is_no_longer_a_payment_method(self):
        self.as_(self.owner)
        self.assertEqual(self.pay("monthly", "BANK").status_code, 400)
        self.assertFalse(ManualPayment.objects.exists())

