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

from django.conf import settings
from django.db import models
from django.db.models import Q


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


class PaymentClaim(models.Model):
    """A GCash payment claim submitted by a member and reviewed by staff.

    Separate from ``Payment`` so the old PayMongo rows keep their required
    subscription and reference fields. ``member`` and ``amount_centavos`` are
    supplied by the server, never by the member's form.
    """

    class Status(models.TextChoices):
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    METHOD_GCASH = "GCASH"

    member = models.ForeignKey(
        "membership.MemberProfile",
        on_delete=models.PROTECT,
        related_name="payment_claims",
    )
    amount_centavos = models.PositiveIntegerField()
    method = models.CharField(
        max_length=10,
        choices=[(METHOD_GCASH, "GCash")],
        default=METHOD_GCASH,
    )
    reference_number = models.CharField(max_length=64)
    proof_link = models.URLField(max_length=500)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING_REVIEW,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reviewed_payment_claims",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["reference_number"],
                condition=Q(status__in=("pending_review", "approved")),
                name="unique_active_claim_reference",
            ),
        ]

    def __str__(self):
        return f"PaymentClaim<{self.pk} {self.status}>"

    def save(self, *args, **kwargs):
        # A reference is the same number whether or not the member typed spaces.
        self.reference_number = (self.reference_number or "").replace(" ", "")
        super().save(*args, **kwargs)


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


class PendingSignup(models.Model):
    """A person who started paying to join but has no account yet.

    The account is created ONLY by the PayMongo webhook after the payment is
    confirmed (``services.complete_signup``). The password is stored hashed,
    never as plain text, and is copied to the new login on success.
    """

    checkout_session_id = models.CharField(max_length=255, unique=True, db_index=True)
    token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    name = models.CharField(max_length=150)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True, default="")
    plan = models.CharField(max_length=20)
    password_hash = models.CharField(max_length=256)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"PendingSignup<{self.pk} {self.plan} completed={self.completed}>"
