---
date: Unknown
status: accepted
tags: [decision]
---
# Pay-first join: a person paying to join has no account until the webhook confirms
- Decision: Pay-first join: a person paying to join has **no account** until the webhook confirms; only a `PendingSignup` row exists
- Reason: Nothing is created for an unpaid visitor, and the account exists only after confirmed money
- Trade-offs: Not stated in log
- Evidence: `apps/billing/models.py` (`PendingSignup` docstring), `apps/billing/services.py` (`create_join_checkout`, `complete_signup`)

## Related
- None
