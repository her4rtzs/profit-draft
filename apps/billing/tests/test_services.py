"""Guard tests for the legacy payment status helpers (history rows only)."""

from django.test import TestCase
from django.utils import timezone

from apps.billing.models import Payment, Subscription
from apps.billing.services import (
    activate_paid_payment,
    mark_payment_failed,
    mark_payment_paid,
)
from apps.membership.models import MemberProfile
from django.contrib.auth import get_user_model

User = get_user_model()


def _make_payment(status=Payment.Status.PENDING, pm_id="pm_1", plan=""):
    user = User.objects.create_user(username=f"u_{pm_id}", password="x")
    profile = MemberProfile.objects.create(user=user)
    sub = Subscription.objects.create(member=profile, plan=plan, amount_centavos=10000)
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

    def test_activate_uses_current_expiry_not_stale_object(self):
        payment = _make_payment(pm_id="pm_race", plan="monthly")
        member = payment.subscription.member
        # Another renewal lands after this member object was loaded.
        moved_to = timezone.localdate() + timezone.timedelta(days=10)
        MemberProfile.objects.filter(pk=member.pk).update(
            expiry_date=moved_to, membership_status=MemberProfile.MembershipStatus.ACTIVE
        )
        activate_paid_payment(payment)
        member.refresh_from_db()
        self.assertEqual(member.expiry_date, moved_to + timezone.timedelta(days=30))
