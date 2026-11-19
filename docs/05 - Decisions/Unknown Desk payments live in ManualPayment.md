---
date: Unknown
status: accepted
tags: [decision]
---
# Desk payments live in `finance.ManualPayment`, separate from `billing.Payment`
- Decision: Desk payments live in `finance.ManualPayment`, separate from `billing.Payment`
- Reason: `billing.Payment.status` is written only by the PayMongo webhook; a desk payment is settled the moment staff record it
- Trade-offs: Not stated in log
- Evidence: `apps/finance/models.py` (`ManualPayment` docstring)

## Related
- None
