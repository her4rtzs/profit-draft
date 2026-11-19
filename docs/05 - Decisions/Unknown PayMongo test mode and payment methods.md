---
date: Unknown
status: accepted
tags: [decision]
---
# PayMongo runs in test mode only; methods come from `PAYMONGO_PAYMENT_METHODS`
- Decision: PayMongo runs in **test mode only**; methods come from `PAYMONGO_PAYMENT_METHODS`
- Reason: No live keys or real money; enabling a method is configuration, not code
- Trade-offs: Not stated in log
- Evidence: `Architecture.md` §13; `profit/settings.py`

## Related
- None
