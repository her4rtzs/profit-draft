"""Member GCash payments: three fields in, everything else set by the server."""

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing.models import PaymentClaim
from apps.finance.models import ManualPayment
from apps.finance.services import PLAN_PRICE_CENTAVOS
from apps.membership.models import MemberProfile
from apps.membership.services import enroll_member, start_trial
from apps.notifications.models import Notification

User = get_user_model()
URL = "/api/member/claims/"
VALID = {
    "plan": "monthly",
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
        self.assertEqual(claim.plan, "monthly")
        self.assertEqual(claim.amount_centavos, PLAN_PRICE_CENTAVOS["monthly"])
        self.assertEqual(claim.method, "GCASH")
        self.assertEqual(claim.status, PaymentClaim.Status.PENDING_REVIEW)
        self.assertEqual(claim.reference_number, "09171234567")
        self.assertEqual(claim.proof_link, VALID["proof_link"])
        self.assertIsNone(claim.reviewed_by)
        self.assertIsNone(claim.reviewed_at)
        self.assertEqual(res.data["status"], "pending_review")

    def test_amount_comes_from_the_chosen_plan(self):
        res = self.api.post(URL, {**VALID, "plan": "quarterly"}, format="json")
        self.assertEqual(res.status_code, 201)
        claim = PaymentClaim.objects.get()
        self.assertEqual(claim.plan, "quarterly")
        self.assertEqual(claim.amount_centavos, PLAN_PRICE_CENTAVOS["quarterly"])

    def test_sample_reference_formats_are_accepted(self):
        for reference, stored in (
            ("6028871884223", "6028871884223"),
            ("6028 871 884224", "6028871884224"),
        ):
            with self.subTest(reference=reference):
                res = self.api.post(
                    URL, {**VALID, "reference_number": reference}, format="json"
                )
                self.assertEqual(res.status_code, 201, res.content)
                self.assertTrue(
                    PaymentClaim.objects.filter(reference_number=stored).exists()
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
        for reference in (
            "123456789",  # 9 digits
            "12345678901234",  # 14 digits
            "0917123",
            "0917abc4567",
            "0917-123-4567",
            "1" * 21,
        ):
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

    def test_duplicate_reference_is_rejected(self):
        self.assertEqual(self.api.post(URL, VALID, format="json").status_code, 201)
        res = self.api.post(
            URL, {**VALID, "reference_number": "09171234567"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("already in use", str(res.data["reference_number"]))

        ManualPayment.objects.create(
            member=self.profile,
            plan="monthly",
            method=ManualPayment.Method.GCASH,
            amount_centavos=PLAN_PRICE_CENTAVOS["monthly"],
            reference_number="6028871884223",
            paid_on=timezone.localdate(),
            recorded_by=self.staff,
        )
        res = self.api.post(
            URL, {**VALID, "reference_number": "6028 871 884223"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("already in use", str(res.data["reference_number"]))

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

    def test_trial_member_can_submit(self):
        self.profile.expiry_date = None
        self.profile.save(update_fields=["expiry_date"])
        start_trial(self.profile)

        res = self.api.post(URL, VALID, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(PaymentClaim.objects.count(), 1)

    def test_expired_trial_member_can_submit(self):
        self.profile.expiry_date = None
        self.profile.save(update_fields=["expiry_date"])
        start_trial(self.profile, now=timezone.now() - timedelta(days=8))

        res = self.api.post(URL, VALID, format="json")
        self.assertEqual(res.status_code, 201, res.content)

    def test_submit_notifies_member_and_sends_email(self):
        with mock.patch("apps.notifications.services.send_mail") as send, \
                self.captureOnCommitCallbacks(execute=True):
            res = self.api.post(URL, VALID, format="json")

        self.assertEqual(res.status_code, 201)
        note = Notification.objects.get(recipient=self.user)
        self.assertEqual(note.kind, Notification.Kind.MEMBERSHIP)
        self.assertIn("pending", note.title.lower())
        self.assertEqual(note.link, "member-home.html")
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.kwargs["recipient_list"], [self.user.email])
        contents = send.call_args.kwargs["message"] + send.call_args.kwargs["html_message"]
        self.assertNotIn("09171234567", contents)
        self.assertNotIn("drive.google.com", contents)

    def test_payment_history_shows_claim_status_and_plan(self):
        self.api.post(URL, {**VALID, "plan": "quarterly"}, format="json")

        res = self.api.get("/api/member/me/")
        rows = [r for r in res.data["payments"] if str(r["reference"]).startswith("G-")]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "Pending")
        self.assertEqual(rows[0]["plan"], "Quarterly")
        self.assertEqual(rows[0]["method"], "GCash")

    def test_staff_review_list_shows_every_form_submission_field(self):
        self.assertEqual(self.api.post(URL, VALID, format="json").status_code, 201)
        self.api.post(URL, {**VALID, "reference_number": "09171234568"}, format="json")

        staff = APIClient()
        staff.force_authenticate(self.staff)
        res = staff.get("/api/staff/claims/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["items"]), 2)
        row = next(r for r in res.data["items"] if r["reference_number"] == "09171234567")
        self.assertEqual(row["plan"], "monthly")
        self.assertEqual(row["amount_centavos"], PLAN_PRICE_CENTAVOS["monthly"])
        self.assertEqual(row["proof_link"], VALID["proof_link"])
        self.assertTrue(row["member_name"])
        self.assertTrue(row["created_at"])
