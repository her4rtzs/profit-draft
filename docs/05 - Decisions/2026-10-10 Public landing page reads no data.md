---
date: 2026-10-10
status: accepted
tags: [decision]
---
# Repository published; public landing page reads no data
- Decision: Require the owner to authenticate the `gh` CLI before pushing; build the public `/` landing page as an auth-free, DB-free view that links into the gated surfaces, with "Sign in" pointing at `/admin/` at that time; keep `db.sqlite3` ignored.
- Reason: Account-bound authentication cannot be delegated; a public page must not expose member, payment or financial data.
- Trade-offs: The landing page advertised the admin login until custom auth shipped the same month. A real-looking `SECRET_KEY` value found in `.env.example` was reverted before the commit; the value is deliberately not reproduced here.
- Evidence: `.env.example`, `db.sqlite3`, `/admin/`; Source: PROJECT-LOG.md, 2026-10-10 17:15.

## Related
- None
