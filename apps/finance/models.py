"""Finance domain models (Module 3) — stubs for the first build.

Only a read-model stub ships this pass; reporting aggregation is deferred.
Amounts are ALWAYS integer centavos, never floats (per AGENTS.md).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q


class TransactionRecord(models.Model):
    """Read-model stub linking a payment into the finance ledger."""

    payment = models.ForeignKey(
        "billing.Payment",
        on_delete=models.CASCADE,
        related_name="transaction_records",
    )
    amount_centavos = models.PositiveIntegerField()
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"TransactionRecord<{self.pk} payment={self.payment_id}>"


class ManualPayment(models.Model):
    """A payment staff recorded at the desk: cash or GCash.

    Kept separate from ``billing.Payment`` on purpose: that table holds
    read-only history from the retired online gateway, while a desk payment is
    settled the moment staff record it.
    """

    class Plan(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        ANNUAL = "annual", "Annual"

    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        GCASH = "GCASH", "GCash"

    member = models.ForeignKey(
        "membership.MemberProfile",
        on_delete=models.PROTECT,
        related_name="manual_payments",
    )
    plan = models.CharField(max_length=20, choices=Plan.choices)
    method = models.CharField(max_length=20, choices=Method.choices)
    amount_centavos = models.PositiveIntegerField()
    # Required for GCash desk payments. Stored with spaces removed so it
    # matches the reference on a member's GCash claim.
    reference_number = models.CharField(max_length=64, null=True, blank=True)
    paid_on = models.DateField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["reference_number"],
                condition=Q(method="GCASH") & ~Q(reference_number=""),
                name="unique_desk_gcash_reference",
            ),
        ]

    def __str__(self):
        return f"ManualPayment<{self.pk} {self.plan} {self.method}>"

    def save(self, *args, **kwargs):
        if self.reference_number is not None:
            self.reference_number = self.reference_number.replace(" ", "")
        super().save(*args, **kwargs)

