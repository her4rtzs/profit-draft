"""Owner/Cashier claim review: permissions, one-time approval and rejection."""

from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.billing.models import PaymentClaim
from apps.membership.models import Enrollment, MemberProfile
from apps.notifications.models import Notification

User = get_user_model()
LIST = "/api/staff/claims/"


class ClaimReviewTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner@example.com", password="x", role="OWNER"
        )
        self.cashier = User.objects.create_user(
            username="cashier@example.com", password="x", role="CASHIER"
        )
        self.inactive_owner = User.objects.create_user(
            username="oldowner@example.com", password="x", role="OWNER", is_active=False
        )
        self.trainer = User.objects.create_user(
            username="trainer@example.com", password="x", role="TRAINER"
        )
        self.member_user = User.objects.create_user(
            username="member@example.com", email="member@example.com", password="x", role="MEMBER"
        )
        self.member = MemberProfile.objects.create(user=self.member_user)
        self.claim = self._claim("09171234567")
        self.api = APIClient()

    def _claim(self, reference, status=PaymentClaim.Status.PENDING_REVIEW):
        return PaymentClaim.objects.create(
            member=self.member,
            plan="monthly",
            amount_centavos=80_000,
            reference_number=reference,
            proof_link="https://drive.google.com/file/d/abc/view",
            status=status,
        )

    def _as(self, user):
        self.api.force_authenticate(user)

    def test_only_pending_claims_are_listed_for_staff(self):
        self._claim("09179990001", status=PaymentClaim.Status.APPROVED)
        self._claim("09179990002", status=PaymentClaim.Status.REJECTED)
        for user in (self.owner, self.cashier):
            with self.subTest(user=user):
                self._as(user)
                res = self.api.get(LIST)
                self.assertEqual(res.status_code, 200)
                self.assertEqual(len(res.data["items"]), 1)
                row = res.data["items"][0]
                self.assertEqual(row["id"], self.claim.pk)
                self.assertEqual(row["reference_number"], "09171234567")
                self.assertEqual(row["plan"], "monthly")
                self.assertEqual(row["amount_centavos"], 80_000)
                self.assertEqual(row["proof_link"], self.claim.proof_link)
                self.assertTrue(row["member_name"])
                self.assertTrue(row["created_at"])

    def test_wrong_role_inactive_and_anonymous_are_refused(self):
        for user in (self.trainer, self.member_user, self.inactive_owner):
            with self.subTest(user=user):
                self._as(user)
                self.assertEqual(self.api.get(LIST).status_code, 403)
                self.assertEqual(
                    self.api.post(f"{LIST}{self.claim.pk}/approve/").status_code, 403
                )
        self.api.force_authenticate(user=None)
        self.assertIn(self.api.get(LIST).status_code, (401, 403))

    def test_member_cannot_approve(self):
        self._as(self.member_user)
        res = self.api.post(f"{LIST}{self.claim.pk}/approve/")
        self.assertEqual(res.status_code, 403)
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, PaymentClaim.Status.PENDING_REVIEW)
        self.assertEqual(Enrollment.objects.count(), 0)

    def test_approve_enrolls_once_and_is_idempotent(self):
        self._as(self.cashier)
        res = self.api.post(f"{LIST}{self.claim.pk}/approve/")
        self.assertEqual(res.status_code, 200, res.content)

        self.claim.refresh_from_db()
        self.member.refresh_from_db()
        self.assertEqual(self.claim.status, PaymentClaim.Status.APPROVED)
        self.assertEqual(self.claim.reviewed_by, self.cashier)
        self.assertIsNotNone(self.claim.reviewed_at)
        self.assertEqual(self.member.membership_status, "ACTIVE")
        self.assertIsNotNone(self.member.expiry_date)
        self.assertEqual(Enrollment.objects.filter(member=self.member).count(), 1)
        first_expiry = self.member.expiry_date
        first_review = self.claim.reviewed_at

        again = self.api.post(f"{LIST}{self.claim.pk}/approve/")
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.data["already_approved"])
        self.assertEqual(Enrollment.objects.filter(member=self.member).count(), 1)
        self.member.refresh_from_db()
        self.claim.refresh_from_db()
        self.assertEqual(self.member.expiry_date, first_expiry)
        self.assertEqual(self.claim.reviewed_at, first_review)

    def test_reject_requires_a_reason_and_enrolls_nobody(self):
        self._as(self.owner)
        url = f"{LIST}{self.claim.pk}/reject/"
        self.assertEqual(self.api.post(url, {}, format="json").status_code, 400)
        self.assertEqual(self.api.post(url, {"reason": "   "}, format="json").status_code, 400)

        res = self.api.post(url, {"reason": "Receipt did not match"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.claim.refresh_from_db()
        self.member.refresh_from_db()
        self.assertEqual(self.claim.status, PaymentClaim.Status.REJECTED)
        self.assertEqual(self.claim.reject_reason, "Receipt did not match")
        self.assertEqual(self.claim.reviewed_by, self.owner)
        self.assertIsNotNone(self.claim.reviewed_at)
        self.assertEqual(self.member.membership_status, "PENDING")
        self.assertEqual(Enrollment.objects.count(), 0)

    def test_reject_notifies_member_with_the_reason(self):
        self._as(self.owner)
        with mock.patch("apps.notifications.services.send_mail") as send:
            res = self.api.post(
                f"{LIST}{self.claim.pk}/reject/",
                {"reason": "Receipt did not match"},
                format="json",
            )

        self.assertEqual(res.status_code, 200)
        note = Notification.objects.get(recipient=self.member_user)
        self.assertEqual(note.title, "GCash payment rejected")
        self.assertIn("Receipt did not match", note.body)
        self.assertEqual(send.call_count, 1)

    def test_no_payment_details_are_logged(self):
        self._as(self.cashier)
        with mock.patch("logging.Logger.info") as info, mock.patch("logging.Logger.warning") as warn:
            self.api.post(f"{LIST}{self.claim.pk}/approve/")
        logged = " ".join(
            str(arg)
            for call in info.mock_calls + warn.mock_calls
            for arg in call.args
        )
        self.assertNotIn("09171234567", logged)
        self.assertNotIn("https://drive.google.com", logged)

    def test_approval_creates_website_notification_and_email(self):
        self._as(self.cashier)
        with mock.patch("apps.notifications.services.send_mail") as send:
            res = self.api.post(f"{LIST}{self.claim.pk}/approve/")

        self.assertEqual(res.status_code, 200)
        note = Notification.objects.get(recipient=self.member_user)
        self.assertEqual(note.kind, Notification.Kind.MEMBERSHIP)
        self.assertEqual(note.title, "GCash payment approved")
        self.assertEqual(note.link, "member-home.html")
        self.assertIn("monthly", note.body)

        self.assertEqual(send.call_count, 1)
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs["recipient_list"], [self.member_user.email])
        self.assertIn("approved", kwargs["subject"])
        contents = kwargs["message"] + kwargs["html_message"]
        self.assertNotIn("09171234567", contents)
        self.assertNotIn("drive.google.com", contents)

    def test_email_failure_does_not_break_approval(self):
        self._as(self.cashier)
        with mock.patch(
            "apps.notifications.services.send_mail",
            side_effect=RuntimeError("smtp down"),
        ):
            res = self.api.post(f"{LIST}{self.claim.pk}/approve/")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            Notification.objects.filter(recipient=self.member_user).count(), 1
        )
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, PaymentClaim.Status.APPROVED)

    def test_duplicate_approval_does_not_repeat_notifications(self):
        self._as(self.cashier)
        with mock.patch("apps.notifications.services.send_mail") as send:
            self.api.post(f"{LIST}{self.claim.pk}/approve/")
            self.api.post(f"{LIST}{self.claim.pk}/approve/")

        self.assertEqual(send.call_count, 1)
        self.assertEqual(
            Notification.objects.filter(recipient=self.member_user).count(), 1
        )


class ReviewPageMarkupTests(TestCase):
    def test_review_table_shows_plan_and_opens_proof_safely(self):
        web = Path(__file__).resolve().parents[3] / "web"
        html = (web / "payments.html").read_text(encoding="utf-8")
        script = (web / "payments-review.js").read_text(encoding="utf-8")

        css = (web / "finance-ui.css").read_text(encoding="utf-8")

        self.assertIn("Payments for review", html)
        self.assertIn('data-tab="review"', html)
        self.assertIn("<th>Plan</th>", html)
        self.assertIn("fn-table--review", html)
        self.assertIn(".fn-table--review", css)
        self.assertIn('id="proofPreviewModal"', html)
        self.assertIn('id="rejectPaymentModal"', html)
        self.assertIn('data-confirm="', script)
        self.assertIn('data-preview="', script)
        self.assertIn('class="pp-member review-card"', script)
        self.assertIn('class="pp-avatar"', script)
        self.assertIn('class="pp-status pending"', script)
        self.assertIn('class="pp-kv"', script)
        self.assertIn('class="pp-meter"', script)
        self.assertIn('class="review-decision-actions"', script)
        self.assertIn("Pending", script)
        self.assertIn('target="_blank" rel="noopener noreferrer"', script)
        self.assertIn(".review-card-cell .pp-member {", css)
        self.assertIn("@media (max-width: 768px)", css)
        self.assertGreater(
            css.index("@media (max-width: 768px)"),
            css.index(".fn-table tbody tr {"),
        )
