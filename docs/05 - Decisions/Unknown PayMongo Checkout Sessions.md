---
date: Unknown
status: accepted
tags: [decision]
---
# PayMongo Checkout Sessions are used rather than payment intents
- Decision: PayMongo **Checkout Sessions** are used rather than payment intents
- Reason: Hosted checkout keeps the client out of card/wallet handling
- Trade-offs: Not stated in log
- Evidence: `apps/billing/services.py` (`PAYMONGO_CHECKOUT_URL = ".../v1/checkout_sessions"`), `ROADMAP.md` phase 3

## Related
- None
