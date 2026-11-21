---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Free sign-up with a seven-day trial
- Decision: Sign-up is free and creates a Member in `trial` status for 7 days. The trial gives app access only: the member can log in and see their profile and payment pages, but has no gym membership and cannot be checked in.
- Reason: A visitor can try the app without paying first, and a trial member is clearly separated from a paying member, so nobody gets gym access for free.
- Trade-offs: A new status has to be handled everywhere `pending` is handled today, and the app has to keep working for someone who has not paid; what happens when the 7 days end is recorded as an open question in `Architecture.md`.
- Evidence: Docs only. `AGENTS.md` Current phase, Stack, Modules, Request flow, Payments, RBAC, env vars; `Architecture.md` Sections 1-7 and 12; `ROADMAP.md` Phase 4.6. No code changed and no test run, by request.

## Related
- [[Pay-first join has no account until paid]]
- [[2026-11-21 GCash claims reviewed by staff]]
