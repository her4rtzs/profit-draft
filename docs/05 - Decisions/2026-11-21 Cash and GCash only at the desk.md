---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Cash and GCash only at the desk
- Decision: `ManualPayment.Method` is now `CASH` and `GCASH` only; bank transfer is removed from the model, API choices, staff forms, filters and demo data. A GCash desk payment requires a 10-20 character digits-and-spaces reference, stored with spaces removed. The same reference cannot be reused by another settled GCash desk payment or by a pending/approved member claim; a rejected claim's reference can be used again. Recording still goes through the shared membership renewal service. Financial totals add approved claims on their review date, desk payments, and old `Payment` rows with status `PAID`; pending and rejected claims are excluded. Migration `finance.0003` is created but not applied.
- Reason: bank transfer was never implemented and the payment design has exactly two methods. A GCash payment needs the same reference discipline as a GCash claim or staff could approve the same money twice.
- Trade-offs: the desk/claim uniqueness check spans two tables, so the database constraint only covers desk payments and the cross-table rule lives in the two services. Claim totals use the approval date, not the submission date. Old BANK rows (if any exist outside this repo's test data) keep their stored value but are no longer selectable in the UI.
- Evidence: `apps/finance/models.py`, `apps/finance/services.py`, `apps/finance/migrations/0003_manualpayment_reference_number_and_more.py`, `api/serializers.py`, `api/staff.py`, `api/claims.py`, `web/cashier.*`, `web/payments.html`, `web/pages.js`, `web/data.js`, `web/config.js`. `python manage.py test` passed 286 tests.

## Related
- [[2026-11-21 Payment claims get their own model]]
- [[2026-11-21 Staff review of GCash claims]]
