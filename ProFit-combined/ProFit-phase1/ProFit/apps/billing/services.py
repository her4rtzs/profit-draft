"""Billing services (Module 2).

Business logic lives here (and in model methods), never in views/webhooks.

``mark_payment_paid`` and ``mark_payment_failed`` are the ONLY functions that
write ``Payment.status`` to PAID/FAILED. They guard illegal/stale transitions so
an out-of-order webhook redelivery (a ``failed`` arriving after ``paid``, or a
``paid`` after ``failed``) can never flip a settled payment — the mutator is a
no-op once the payment has reached a terminal state (NIT-4).
"""

from django.utils import timezone

from .models import Payment


def create_payment_intent(subscription, amount_centavos):
    """Create a PayMongo payment intent for ``subscription``.

    DOCUMENTED STUB: the PayMongo HTTP call is deferred to the billing pass, so
    this raises ``NotImplementedError`` for now. The signature is fixed here so
    callers wired in a later pass have a stable contract. ``amount_centavos`` is
    an integer number of centavos (never a float).
    """
    raise NotImplementedError(
        "create_payment_intent is a stub this pass; the PayMongo HTTP client is "
        "deferred to the billing-implementation pass."
    )


def mark_payment_paid(payment):
    """Flip ``payment`` to PAID. Sole writer of PAID; guards stale transitions.

    No-op when the payment is already in a terminal state (PAID or FAILED), so
    an out-of-order redelivery cannot overwrite a settled payment. Returns the
    payment unchanged in that case.
    """
    if payment.status in (Payment.Status.PAID, Payment.Status.FAILED):
        return payment
    payment.status = Payment.Status.PAID
    payment.updated_at = timezone.now()
    payment.save(update_fields=["status", "updated_at"])
    return payment


def mark_payment_failed(payment):
    """Flip ``payment`` to FAILED. Sole writer of FAILED; guards stale transitions.

    No-op when the payment is already in a terminal state (PAID or FAILED), so a
    ``failed`` arriving after ``paid`` cannot un-settle the payment. Returns the
    payment unchanged in that case.
    """
    if payment.status in (Payment.Status.PAID, Payment.Status.FAILED):
        return payment
    payment.status = Payment.Status.FAILED
    payment.updated_at = timezone.now()
    payment.save(update_fields=["status", "updated_at"])
    return payment
