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

    def pay(self, plan="monthly", method="CASH", member=None):
        return self.api.post(
            PAY,
            {"member_id": (member or self.member).pk, "plan": plan, "method": method},
            format="json",
        )

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
        self.assertEqual(self.pay("annual", "BANK").status_code, 201)
        today = timezone.localdate()
        res = self.api.get(SUMMARY, {"year": today.year, "month": today.month})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["desk_centavos"], 80_000 + 750_000)
        self.assertEqual(body["online_centavos"], 0)
        self.assertEqual(body["total_centavos"], 830_000)
        self.assertEqual(body["payment_count"], 2)
        self.assertEqual(body["by_method"], {"CASH": 80_000, "BANK": 750_000})
        self.assertEqual(body["by_plan"], {"monthly": 80_000, "annual": 750_000})

        self.as_(self.cashier)
        self.assertEqual(self.api.get(SUMMARY).status_code, 403)

    def test_summary_rejects_bad_month(self):
        self.as_(self.owner)
        self.assertEqual(self.api.get(SUMMARY, {"month": 13}).status_code, 400)
