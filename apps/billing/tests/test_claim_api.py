"""Member claim API: two fields in, everything else set by the server."""

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing.models import PaymentClaim, Subscription
from apps.finance.services import PLAN_PRICE_CENTAVOS
from apps.membership.models import MemberProfile
from apps.membership.services import enroll_member, start_trial

User = get_user_model()
URL = "/api/member/claims/"
VALID = {
    "reference_number": "0917 123 4567",
    "proof_link": "https://drive.google.com/file/d/abc/view?usp=sharing",
}


class MemberClaimApiTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="cashier", password="x", role="CASHIER")
        self.user = User.objects.create_user(
            username="member@example.com", email="member@example.com",
            password="Password123!", role="MEMBER",
        )
        self.profile = MemberProfile.objects.create(user=self.user)
        today = timezone.localdate()
        enroll_member(self.profile, today, today + timedelta(days=30), created_by=self.staff)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def test_submit_sets_every_server_field(self):
        with mock.patch("urllib.request.urlopen") as urlopen:
            res = self.api.post(URL, VALID, format="json")
        urlopen.assert_not_called()  # the Drive link is never fetched

        self.assertEqual(res.status_code, 201, res.content)
        claim = PaymentClaim.objects.get()
        self.assertEqual(claim.member, self.profile)
        self.assertEqual(claim.amount_centavos, PLAN_PRICE_CENTAVOS["monthly"])
        self.assertEqual(claim.method, "GCASH")
        self.assertEqual(claim.status, PaymentClaim.Status.PENDING_REVIEW)
        self.assertEqual(claim.reference_number, "09171234567")
        self.assertEqual(claim.proof_link, VALID["proof_link"])
        self.assertIsNone(claim.reviewed_by)
        self.assertIsNone(claim.reviewed_at)
        self.assertEqual(res.data["status"], "pending_review")

    def test_amount_comes_from_the_latest_subscription_plan(self):
        Subscription.objects.create(
            member=self.profile, plan="quarterly",
            amount_centavos=PLAN_PRICE_CENTAVOS["quarterly"],
        )
        res = self.api.post(URL, VALID, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            PaymentClaim.objects.get().amount_centavos, PLAN_PRICE_CENTAVOS["quarterly"]
        )

    def test_client_cannot_set_status_amount_or_member(self):
        for extra in (
            {"status": "approved"},
            {"amount": 1},
            {"amount_centavos": 1},
            {"member_id": 999},
            {"member": 999},
            {"method": "CASH"},
        ):
            with self.subTest(extra=extra):
                res = self.api.post(URL, {**VALID, **extra}, format="json")
                self.assertEqual(res.status_code, 400)
                self.assertEqual(PaymentClaim.objects.count(), 0)

    def test_bad_reference_numbers_are_rejected(self):
        for reference in ("0917123", "0917abc4567", "0917-123-4567", "1" * 21):
            with self.subTest(reference=reference):
                res = self.api.post(
                    URL, {**VALID, "reference_number": reference}, format="json"
                )
                self.assertEqual(res.status_code, 400)
        self.assertEqual(PaymentClaim.objects.count(), 0)

    def test_bad_proof_links_are_rejected(self):
        for link in (
            "http://drive.google.com/file/d/abc/view",
            "https://example.com/file",
            "https://drive.google.com.evil.com/file",
            "https://drive.google.com/" + "a" * 500,
        ):
            with self.subTest(link=link[:40]):
                res = self.api.post(URL, {**VALID, "proof_link": link}, format="json")
                self.assertEqual(res.status_code, 400)
        self.assertEqual(PaymentClaim.objects.count(), 0)

    def test_at_most_three_pending_claims_and_rejected_can_resubmit(self):
        for i in range(3):
            self.assertEqual(
                self.api.post(
                    URL,
                    {**VALID, "reference_number": f"0917123000{i}"},
                    format="json",
                ).status_code,
                201,
            )
        res = self.api.post(
            URL, {**VALID, "reference_number": "09171230009"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("at most 3", str(res.data["detail"]))
        self.assertEqual(PaymentClaim.objects.count(), 3)

        PaymentClaim.objects.filter(reference_number="09171230000").update(
            status=PaymentClaim.Status.REJECTED
        )
        res = self.api.post(
            URL, {**VALID, "reference_number": "09171230000"}, format="json"
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(PaymentClaim.objects.count(), 4)

    def test_member_sees_only_their_own_claims_and_status(self):
        own = self.api.post(URL, VALID, format="json")
        other_user = User.objects.create_user(username="other@example.com", password="Password123!")
        other_profile = MemberProfile.objects.create(user=other_user)
        PaymentClaim.objects.create(
            member=other_profile, amount_centavos=80_000,
            reference_number="09179990000", proof_link=VALID["proof_link"],
        )

        res = self.api.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["items"]), 1)
        self.assertEqual(res.data["items"][0]["id"], own.data["id"])
        self.assertEqual(res.data["items"][0]["status"], "pending_review")

    def test_trial_member_cannot_submit_a_claim(self):
        self.profile.expiry_date = None
        self.profile.save(update_fields=["expiry_date"])
        start_trial(self.profile)

        res = self.api.post(URL, VALID, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertIn("profile only", str(res.data["detail"]))
        self.assertEqual(PaymentClaim.objects.count(), 0)
