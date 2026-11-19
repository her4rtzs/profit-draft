---
date: 2026-11-13
status: accepted
tags: [decision]
---
# Validation/security documentation grounded in the code
- Decision: Write the data-validation and security/privacy sections from the implemented ORM constraints, DRF serializers, webhook handler and production settings, including Argon2, HMAC-SHA256 verification and RA 10173.
- Reason: Documentation must stay consistent with the repository rather than describe intended behaviour.
- Trade-offs: Not stated in log
- Evidence: `apps/accounts/`, `apps/membership/`, `apps/billing/`, `api/serializers.py`, `profit/settings.py`; Source: PROJECT-LOG.md, 2026-11-13 22:42.

## Related
- None
