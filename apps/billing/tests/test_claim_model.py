"""Data rules for GCash claims: normalised references and conditional uniqueness."""

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.billing.models import PaymentClaim
from apps.membership.models import MemberProfile

User = get_user_model()


class PaymentClaimModelTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="claim-member", password="x")
        self.member = MemberProfile.objects.create(user=user)
        self.reviewer = User.objects.create_user(
            username="cashier", password="x", role="CASHIER"
        )

    def _claim(self, reference="09171234567", **kwargs):
        return PaymentClaim.objects.create(
            member=self.member,
            amount_centavos=80_000,
            reference_number=reference,
            proof_link="https://drive.google.com/file/d/abc/view",
            **kwargs,
        )

    def test_defaults_and_normalised_reference(self):
        claim = self._claim("0917 123 4567")

        self.assertEqual(claim.reference_number, "09171234567")
        self.assertEqual(claim.method, "GCASH")
        self.assertEqual(claim.status, PaymentClaim.Status.PENDING_REVIEW)
        self.assertEqual(claim.amount_centavos, 80_000)
        self.assertIsNone(claim.reviewed_by)
        self.assertIsNone(claim.reviewed_at)
        self.assertEqual(claim.reject_reason, "")
        claim.refresh_from_db()
        self.assertEqual(claim.reference_number, "09171234567")

    def test_two_pending_claims_cannot_reuse_a_reference(self):
        self._claim()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._claim()

    def test_pending_and_approved_cannot_reuse_a_reference(self):
        self._claim(status=PaymentClaim.Status.APPROVED)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._claim()

    def test_two_approved_claims_cannot_reuse_a_reference(self):
        self._claim(status=PaymentClaim.Status.APPROVED)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._claim(status=PaymentClaim.Status.APPROVED)

    def test_rejected_claim_can_be_resubmitted(self):
        rejected = self._claim(status=PaymentClaim.Status.REJECTED)
        rejected.reviewed_by = self.reviewer
        rejected.reviewed_at = timezone.now()
        rejected.reject_reason = "Reference did not match"
        rejected.save()

        fresh = self._claim()
        self.assertNotEqual(fresh.pk, rejected.pk)
        self.assertEqual(
            PaymentClaim.objects.filter(reference_number="09171234567").count(), 2
        )
