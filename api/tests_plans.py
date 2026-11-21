"""Tests for public plan price reads and Owner-only plan price updates."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.finance.models import PlanPrice
from apps.finance.services import get_plan_price_centavos

User = get_user_model()


class PlanPricesApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner_plans",
            email="owner_plans@example.com",
            password="Password123!",
            role="OWNER",
            is_active=True,
        )
        self.cashier = User.objects.create_user(
            username="cashier_plans",
            email="cashier_plans@example.com",
            password="Password123!",
            role="CASHIER",
            is_active=True,
        )
        self.member = User.objects.create_user(
            username="member_plans",
            email="member_plans@example.com",
            password="Password123!",
            role="MEMBER",
            is_active=True,
        )

    def test_public_endpoint_returns_defaults(self):
        client = APIClient()
        res = client.get("/api/plans/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["plans"]["monthly"]["price"], 800)
        self.assertEqual(res.data["plans"]["monthly"]["price_centavos"], 80000)

    def test_owner_can_update_prices_and_public_reflects_change(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        res = client.patch(
            "/api/staff/plans/",
            {"plans": {"daily": 100, "monthly": 950, "quarterly": 2500, "annual": 8000}},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["plans"]["monthly"]["price"], 950)
        self.assertEqual(get_plan_price_centavos("monthly"), 95000)
        self.assertEqual(PlanPrice.objects.get(plan="monthly").price_centavos, 95000)

        pub = APIClient().get("/api/plans/")
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(pub.data["plans"]["monthly"]["price"], 950)
        self.assertEqual(pub.data["plans"]["annual"]["price"], 8000)

    def test_cashier_and_member_cannot_update_prices(self):
        for user in (self.cashier, self.member):
            client = APIClient()
            client.force_authenticate(user=user)
            res = client.patch("/api/staff/plans/", {"plans": {"monthly": 500}}, format="json")
            self.assertEqual(res.status_code, 403)
