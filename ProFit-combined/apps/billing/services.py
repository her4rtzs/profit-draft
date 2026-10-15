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
import secrets
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.finance.services import PLAN_PRICE_CENTAVOS
from apps.membership.services import renew_member

from .models import Payment, PendingSignup, Subscription

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


def _paymongo_session(plan, *, success_url, cancel_url):
    """Create a PayMongo Checkout Session; return (session_id, checkout_url, amount)."""
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
        return data["id"], data["attributes"]["checkout_url"], amount
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError):
        logger.warning("paymongo checkout session failed")
        raise CheckoutError("Could not start the payment. Please try again.")


def create_join_checkout(*, name, email, phone, plan, password, success_url, cancel_url):
    """Pay-first join: start a checkout for someone with NO account yet.

    Nothing is created for the person except a PendingSignup (hashed password).
    The login and membership are created by the webhook once the payment is
    confirmed. Returns the hosted ``checkout_url``.
    """
    from django.contrib.auth import get_user_model
    from django.contrib.auth.hashers import make_password
    from django.contrib.auth.password_validation import validate_password

    if plan not in PLAN_PRICE_CENTAVOS:
        raise ValidationError("Choose a plan.")
    name = (name or "").strip()
    email = (email or "").strip().lower()
    if len(name) < 2:
        raise ValidationError("Enter your full name.")
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise ValidationError("Enter a valid email address.")
    if get_user_model().objects.filter(username=email).exists():
        raise ValidationError("An account with this email already exists. Sign in instead, then choose a plan.")
    validate_password(password or "")
    token = secrets.token_urlsafe(24)
    session_id, checkout_url, _ = _paymongo_session(
        plan, success_url=f"{success_url}&t={token}", cancel_url=cancel_url)
    PendingSignup.objects.create(
        checkout_session_id=session_id, token=token, name=name, email=email, phone=(phone or "").strip(),
        plan=plan, password_hash=make_password(password),
    )
    return checkout_url


def complete_signup(pending):
    """Create the login, member profile, payment record and active membership.

    Called by the webhook when a confirmed payment belongs to a PendingSignup.
    Safe to call twice: a completed signup is skipped. If the email was taken in
    the meantime, the payment is applied to that existing member so money is
    never lost.
    """
    from django.contrib.auth import get_user_model
    from apps.membership.models import MemberProfile
    from apps.membership.services import _split_name

    User = get_user_model()
    with transaction.atomic():
        pending = PendingSignup.objects.select_for_update().get(pk=pending.pk)
        if pending.completed:
            return None
        user = User.objects.filter(username=pending.email).first()
        if user is None:
            first, last = _split_name(pending.name)
            user = User(username=pending.email, email=pending.email, first_name=first,
                        last_name=last, role="MEMBER", is_active=True)
            user.password = pending.password_hash
            user.save()
        profile, _ = MemberProfile.objects.get_or_create(user=user, defaults={"phone": pending.phone})
        if pending.phone and not profile.phone:
            profile.phone = pending.phone
            profile.save(update_fields=["phone"])
        amount = PLAN_PRICE_CENTAVOS[pending.plan]
        sub = Subscription.objects.create(member=profile, plan=pending.plan, amount_centavos=amount)
        payment = Payment.objects.create(subscription=sub, amount_centavos=amount,
                                         paymongo_payment_id=pending.checkout_session_id)
        mark_payment_paid(payment)
        activate_paid_payment(payment)
        pending.completed = True
        pending.save(update_fields=["completed"])
    return payment


def _session_is_paid(session_id):
    """Ask PayMongo directly whether this checkout session has a paid payment."""
    key = getattr(settings, "PAYMONGO_SECRET_KEY", "")
    if not key:
        return False
    auth = base64.b64encode(f"{key}:".encode()).decode()
    req = urllib.request.Request(
        f"{PAYMONGO_CHECKOUT_URL}/{session_id}",
        headers={"Authorization": f"Basic {auth}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            attrs = json.loads(resp.read().decode())["data"]["attributes"]
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError):
        logger.warning("session lookup failed")
        return False
    for pay in attrs.get("payments") or []:
        if (pay.get("attributes") or {}).get("status") == "paid":
            return True
    intent = attrs.get("payment_intent") or {}
    return (intent.get("attributes") or {}).get("status") == "succeeded"


def confirm_join(token):
    """Return 'active' once the signup is paid and its account exists, else 'pending'.

    Backs up the webhook: the server itself asks PayMongo, so the browser can never
    claim a payment. Safe to call repeatedly (complete_signup is idempotent).
    """
    pending = PendingSignup.objects.filter(token=token or "").first() if token else None
    if pending is None:
        raise ValidationError("Unknown signup.")
    if pending.completed:
        return "active"
    if _session_is_paid(pending.checkout_session_id):
        complete_signup(pending)
        return "active"
    return "pending"
