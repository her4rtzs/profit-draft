"""Finance domain models (Module 3) — stubs for the first build.

Only a read-model stub ships this pass; reporting aggregation is deferred.
Amounts are ALWAYS integer centavos, never floats (per AGENTS.md).
"""

from django.db import models


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
