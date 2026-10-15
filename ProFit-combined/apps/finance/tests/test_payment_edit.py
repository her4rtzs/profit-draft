"""Owner can correct the method or date of a desk payment; nothing else changes."""

import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.finance.models import ManualPayment
from apps.membership.models import MemberProfile

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"


class PaymentEditTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = User.objects.create_user(username="o@gym.test", email="o@gym.test", password=PASSWORD, role="OWNER")
        self.cashier = User.objects.create_user(username="c@gym.test", email="c@gym.test", password=PASSWORD, role="CASHIER")
        member_user = User.objects.create_user(username="m@gym.test", email="m@gym.test", password=PASSWORD, role="MEMBER")
        self.member = MemberProfile.objects.create(user=member_user)
        self.payment = ManualPayment.objects.create(
            member=self.member, plan="monthly", method="CASH", amount_centavos=80_000,
            paid_on=timezone.localdate(), recorded_by=self.owner,
        )
        self.url = f"/api/staff/payments/{self.payment.pk}/"

    def test_owner_can_change_method_and_date(self):
        self.api.force_authenticate(self.owner)
        day = timezone.localdate() - datetime.timedelta(days=2)
        res = self.api.patch(self.url, {"method": "GCASH", "paid_on": day.isoformat()}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.method, "GCASH")
        self.assertEqual(self.payment.paid_on, day)
        self.assertEqual(self.payment.amount_centavos, 80_000)

    def test_amount_and_plan_are_ignored(self):
        self.api.force_authenticate(self.owner)
        res = self.api.patch(self.url, {"method": "BANK", "amount_centavos": 1, "plan": "annual"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual((self.payment.plan, self.payment.amount_centavos), ("monthly", 80_000))

    def test_future_date_and_empty_body_rejected(self):
        self.api.force_authenticate(self.owner)
        future = (timezone.localdate() + datetime.timedelta(days=1)).isoformat()
        self.assertEqual(self.api.patch(self.url, {"paid_on": future}, format="json").status_code, 400)
        self.assertEqual(self.api.patch(self.url, {}, format="json").status_code, 400)

    def test_cashier_cannot_edit(self):
        self.api.force_authenticate(self.cashier)
        res = self.api.patch(self.url, {"method": "BANK"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_unknown_payment_is_404(self):
        self.api.force_authenticate(self.owner)
        self.assertEqual(self.api.patch("/api/staff/payments/99999/", {"method": "CASH"}, format="json").status_code, 404)
