---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Payment claims get their own model
- Decision: GCash claims live in a new `billing.PaymentClaim` model, not in `billing.Payment`. It stores a server-set `member`, a server-price `amount_centavos`, `method` fixed to GCash, a space-normalised `reference_number`, `proof_link`, a status of `pending_review` / `approved` / `rejected`, `reviewed_by`, `reviewed_at`, `reject_reason` and `created_at`. A conditional unique constraint blocks a second `pending_review` or `approved` claim with the same reference; a `rejected` claim may be resubmitted. Migration `0005_paymentclaim` is created but not applied.
- Reason: `Payment` requires a subscription and a unique PayMongo reference and uses different statuses, so claims would force changes to a table that holds real payment history. A separate model keeps that history untouched and keeps the new constraint away from old rows.
- Trade-offs: the Financial Dashboard will later have to read claims and old `Payment` rows in one service. Two migrations now need applying (membership `0005` and billing `0005`), and the new Supabase table needs Row Level Security enabled with no policies.
- Evidence: `apps/billing/models.py`, `apps/billing/migrations/0005_paymentclaim.py`, `apps/billing/tests/test_claim_model.py`. `python manage.py test` passed 262 tests. No views or endpoints changed.

## Related
- [[2026-11-21 GCash claims reviewed by staff]]
- [[2026-11-21 Free sign-up with a seven-day trial]]
