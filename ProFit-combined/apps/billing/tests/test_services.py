"""Single-writer / stale-transition guard tests for the payment mutators."""

from django.test import TestCase

from apps.billing.models import Payment, Subscription, WebhookEvent
from apps.billing.services import (
    create_payment_intent,
    mark_payment_failed,
    mark_payment_paid,
)
from apps.membership.models import MemberProfile
from django.contrib.auth import get_user_model

User = get_user_model()


def _make_payment(status=Payment.Status.PENDING, pm_id="pm_1"):
    user = User.objects.create_user(username=f"u_{pm_id}", password="x")
    profile = MemberProfile.objects.create(user=user)
    sub = Subscription.objects.create(member=profile, amount_centavos=10000)
    return Payment.objects.create(
        subscription=sub,
        amount_centavos=10000,
        status=status,
        paymongo_payment_id=pm_id,
    )


class PaymentMutatorTests(TestCase):
    def test_mark_paid_flips_pending(self):
        payment = _make_payment(pm_id="pm_paid")
        mark_payment_paid(payment)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)

    def test_mark_failed_flips_pending(self):
        payment = _make_payment(pm_id="pm_failed")
        mark_payment_failed(payment)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)

    def test_failed_after_paid_is_noop(self):
        payment = _make_payment(status=Payment.Status.PAID, pm_id="pm_settled")
        mark_payment_failed(payment)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)

    def test_paid_after_failed_is_noop(self):
        payment = _make_payment(status=Payment.Status.FAILED, pm_id="pm_lost")
        mark_payment_paid(payment)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)

    def test_create_payment_intent_is_stub(self):
        with self.assertRaises(NotImplementedError):
            create_payment_intent(None, 10000)
