---
date: 2026-11-22
status: accepted
tags: [decision]
---
# Owner-editable membership plan prices in Settings
- Decision: Store live membership plan prices in a new `finance.PlanPrice` model (integer centavos) with a public read endpoint (`GET /api/plans/`) and an Owner-only update endpoint (`PATCH /api/staff/plans/` guarded by `IsActiveOwner`), and redesign `web/settings.html` into clean grouped cards matching the reference Settings UI.
- Reason: Storing plan prices in the database lets the Owner update Daily, Monthly, Quarterly, and Annual prices once in Settings and immediately reflect them across the landing page (`web/welcome.html`), all portals (`web/data.js`), desk cash/GCash payments (`apps/finance/services.py`), and GCash payment claims (`api/claims.py`, `api/staff_claims.py`) while keeping amounts strictly server-derived.
- Trade-offs: Adds one small table (`public.finance_planprice`) requiring a tracked migration (`finance.0004`) and enabling Supabase RLS with no policies once applied.
- Evidence: Added `PlanPrice` in `apps/finance/models.py`, `get_plan_prices_centavos` / `update_plan_prices` in `apps/finance/services.py`, `api/plans.py`, `IsActiveOwner` in `api/permissions.py`, `api/tests_plans.py`, and updated `api/claims.py`, `api/staff_claims.py`, `web/data.js`, `web/welcome.html`, `web/settings.html`, `web/settings.js`.

## Related
- [[2026-11-08 Daily plan added at PHP 80]]
- [[2026-11-21 Cash and GCash only at the desk]]
