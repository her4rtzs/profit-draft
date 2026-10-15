"""Billing domain models (Module 2) — stubs for the first build.

Only model definitions ship this pass; real PayMongo payment-intent creation
and reporting are deferred. Monetary amounts are ALWAYS integer centavos
(PHP 100.00 = 10000), never floats (per AGENTS.md).

Payment status is written in exactly one place: the PayMongo webhook, via the
single-writer mutators in ``services.py`` (``mark_payment_paid`` /
``mark_payment_failed``). ``WebhookEvent`` is the idempotency ledger; its three
statuses are the only ones the webhook ever records — there is no
``signature_valid`` field (a row is only written for an already-valid signature)
and no ``DEFERRED`` status.
"""

from django.db import models


class Subscription(models.Model):
    """A member's billing subscription (stub)."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"

    member = models.ForeignKey(
        "membership.MemberProfile",
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    plan = models.CharField(max_length=20, blank=True, default="")
    amount_centavos = models.PositiveIntegerField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Subscription<{self.member_id} {self.status}>"


class Payment(models.Model):
    """A single payment against a subscription (stub).

    ``status`` transitions to PAID/FAILED are written ONLY by the webhook via
    ``services.mark_payment_paid`` / ``services.mark_payment_failed``.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"

    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    amount_centavos = models.PositiveIntegerField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    paymongo_payment_id = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payment<{self.pk} {self.status}>"


class WebhookEvent(models.Model):
    """Idempotency ledger for inbound PayMongo webhook events.

    A row exists only for an event whose signature already passed. ``status``
    separates "seen" from "applied":
      - PROCESSED       — a payment transition was applied (terminal).
      - UNKNOWN_PAYMENT — valid + parsed, but no matching Payment yet
                          (reprocessable on a later retry).
      - IGNORED         — valid but the event type is not one we act on
                          (terminal).
    """

    class Status(models.TextChoices):
        PROCESSED = "PROCESSED", "Processed"
        UNKNOWN_PAYMENT = "UNKNOWN_PAYMENT", "Unknown payment"
        IGNORED = "IGNORED", "Ignored"

    event_id = models.CharField(max_length=255, unique=True)
    received_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
    )

    def __str__(self):
        return f"WebhookEvent<{self.event_id} {self.status}>"
