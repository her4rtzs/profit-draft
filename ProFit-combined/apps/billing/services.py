"""Billing services (Module 2).

Business logic lives here (and in model methods), never in views/webhooks.

``mark_payment_paid`` and ``mark_payment_failed`` are the ONLY functions that
write ``Payment.status`` to PAID/FAILED. They guard illegal/stale transitions so
an out-of-order webhook redelivery (a ``failed`` arriving after ``paid``, or a
``paid`` after ``failed``) can never flip a settled payment — the mutator is a
no-op once the payment has reached a terminal state (NIT-4).
"""

import base64
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.finance.services import PLAN_PRICE_CENTAVOS
from apps.membership.services import renew_member

from .models import Payment, Subscription

logger = logging.getLogger("profit.billing")
PAYMONGO_CHECKOUT_URL = "https://api.paymongo.com/v1/checkout_sessions"


class CheckoutError(Exception):
    """PayMongo could not create the checkout session (not configured or rejected)."""


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


def create_checkout(member, plan, *, success_url, cancel_url):
    """Create a PayMongo Checkout Session for ``member`` buying ``plan``.

    Writes a PENDING Subscription and a PENDING Payment keyed by the checkout
    session id. The webhook is still the only place that marks it PAID, and the
    membership activates only then. Returns the hosted ``checkout_url``.
    Amounts are integer centavos. Never logs keys, amounts or PayMongo bodies.
    """
    if plan not in PLAN_PRICE_CENTAVOS:
        raise ValidationError("Unknown plan.")
    key = getattr(settings, "PAYMONGO_SECRET_KEY", "")
    if not key:
        raise CheckoutError("Online payment is not set up yet.")
    amount = PLAN_PRICE_CENTAVOS[plan]
    body = {"data": {"attributes": {
        "description": f"ProFit {plan} membership",
        "line_items": [{"currency": "PHP", "amount": amount, "name": f"{plan.title()} membership", "quantity": 1}],
        "payment_method_types": list(getattr(settings, "PAYMONGO_PAYMENT_METHODS", ["gcash", "paymaya", "card", "qrph"])),
        "success_url": success_url,
        "cancel_url": cancel_url,
        "send_email_receipt": False,
    }}}
    auth = base64.b64encode(f"{key}:".encode()).decode()
    req = urllib.request.Request(
        PAYMONGO_CHECKOUT_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())["data"]
        session_id, checkout_url = data["id"], data["attributes"]["checkout_url"]
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError):
        logger.warning("create_checkout failed")
        raise CheckoutError("Could not start the payment. Please try again.")
    with transaction.atomic():
        sub = Subscription.objects.create(member=member, plan=plan, amount_centavos=amount)
        Payment.objects.create(subscription=sub, amount_centavos=amount, paymongo_payment_id=session_id)
    return checkout_url


def activate_paid_payment(payment):
    """Start the membership period for a payment that just became PAID.

    Called by the webhook only on the PENDING -> PAID transition, so a redelivered
    event can never extend the membership twice. Paying early keeps the days left.
    """
    sub = payment.subscription
    member = sub.member
    today = timezone.localdate()
    start = member.expiry_date if member.expiry_date and member.expiry_date >= today else today
    if sub.plan:
        # The member bought this online, so the enrollment is recorded under their own login.
        renew_member(member, sub.plan, created_by=member.user, start_date=start)
    sub.status = Subscription.Status.ACTIVE
    sub.save(update_fields=["status", "updated_at"])
