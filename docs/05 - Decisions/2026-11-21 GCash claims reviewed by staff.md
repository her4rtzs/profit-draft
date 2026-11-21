---
date: 2026-11-21
status: superseded
tags: [decision]
---
# GCash claims reviewed by staff
Superseded by: [[2026-11-21 Payment claims get their own model]]
- Decision: A GCash payment is submitted as a claim: the GCash reference number and an https Google Drive link to the transaction screenshot, stored as `pending_review` against the plan's server-side price. Only the Owner or Cashier can approve or reject it. Approval marks the claim `approved` and enrolls the member through the existing membership service in one transaction; rejection marks it `rejected` and changes nothing else.
- Reason: There is no payment gateway, so a person must check that the money actually arrived. Keeping the claim as a `payments` row means the Financial Dashboard still reads one table, and routing approval through the one enrollment service avoids a second copy of the enrollment logic.
- Trade-offs: A staff member must review every GCash payment, so enrollment is not instant. Screenshot links live in Google Drive, outside the app, and the server must never fetch them, so staff open them by hand.
- Evidence: Docs only. `AGENTS.md` Payments, Request flow, RBAC, Golden rules 4 and 6, env vars; `Architecture.md` Sections 2, 5, 7 and 8; `ROADMAP.md` Phase 4.6. No code changed and no test run, by request.

## Related
- [[Desk payments live in ManualPayment]]
- [[2026-11-21 Free sign-up with a seven-day trial]]
- [[PayMongo Checkout Sessions]]
