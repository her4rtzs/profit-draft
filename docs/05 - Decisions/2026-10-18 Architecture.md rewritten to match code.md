---
date: 2026-10-18
status: accepted
tags: [decision]
---
# Architecture.md rewritten to match the code
- Decision: Check every claim against the code, rewrite the payment section to PayMongo test mode with methods from `PAYMONGO_PAYMENT_METHODS`, drop the "individual account" reasoning, split the portal bullet into two surfaces, replace the phase-status column with a pointer to the roadmap, delete the prototype references, and fix `architecture.md` → `Architecture.md`.
- Reason: The document named a setting that does not exist (`PAYMONGO_ENABLED_METHODS`) and described a QR Ph-only restriction that was not in the settings at that date; a status column inside a design doc always drifts.
- Trade-offs: The RLS wording and section 5's data model were left describing unbuilt things because only four fixes were authorised; they were reported instead.
- Evidence: `Architecture.md`, `PAYMONGO_PAYMENT_METHODS`, `PAYMONGO_ENABLED_METHODS`, `requirements.txt`; Source: PROJECT-LOG.md, 2026-10-18 23:15.

## Related
- None
