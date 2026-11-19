---
date: 2026-10-10
status: accepted
tags: [decision]
---
# Hold the commit until the build was independently verified
- Decision: Keep all member-auth changes in the working tree until explicitly told to commit; re-run `manage.py check` (0 issues), the 94-test suite and HTTP 200 checks on `/accounts/login`, `/signup`, `/verify` before calling it done; record the session in the append-only log anyway.
- Reason: A sub-process reporting "approved" is not self-verification, and the owner had explicitly asked for a publishing hold.
- Trade-offs: Work stayed uncommitted and unverified by CI until the owner's go-ahead.
- Evidence: `manage.py check`, 94 tests, `/accounts/login`, `/signup`, `/verify`; Source: PROJECT-LOG.md, 2026-10-10 21:35.

## Related
- None
