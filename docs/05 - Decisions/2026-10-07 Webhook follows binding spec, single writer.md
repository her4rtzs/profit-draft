---
date: 2026-10-07
status: accepted
tags: [decision]
---
# Webhook follows the binding spec and only the webhook writes payment status
- Decision: Hash the byte-exact message `t.encode() + b"." + raw_body` as the binding spec requires (overriding `design.md`), read `PAYMONGO_WEBHOOK_SECRET` from the environment with an empty default, make `mark_payment_paid` / `mark_payment_failed` no-ops on terminal payments, and keep the `pg_cron` SQL commented and applied by hand.
- Reason: The feature/context files are authoritative over the older design doc; an empty secret makes every event 400 (the safe offline default); no-op mutators stop out-of-order redelivery from un-settling a payment.
- Trade-offs: Design doc and code now differ on the hash input (recorded, not averaged); expiry is not managed by Django or a migration.
- Evidence: `PAYMONGO_WEBHOOK_SECRET`, `FEAT-003.json`, `context.json`, `design.md`; Source: PROJECT-LOG.md, 2026-10-07 21:30.

## Related
- None
