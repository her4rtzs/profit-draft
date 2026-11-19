---
date: 2026-10-07
status: accepted
tags: [decision]
---
# Session + CSRF login as plain views, RBAC proven on both surfaces
- Decision: Implement login/CSRF as plain Django views, not DRF APIViews; test the RBAC matrix table-driven over `SimpleNamespace` role stand-ins and a test-only `ROOT_URLCONF` guarded by the real permission adapters; extend the webhook suite with the duplicate-PROCESSED no-op and the concurrent-insert `IntegrityError` path.
- Reason: DRF only checks CSRF while authenticating an already-logged-in session, so an anonymous login POST via APIView would skip it; plain views let `CsrfViewMiddleware` enforce it (403 without token, 200 with).
- Trade-offs: A test-only URLConf is extra scaffolding. The Expo mobile skeleton pinned in this entry was later superseded by the installable web app (see 2026-11-16).
- Evidence: `Client(enforce_csrf_checks=True)`, test-only `ROOT_URLCONF`, `mark_payment_paid` / `mark_payment_failed`; Source: PROJECT-LOG.md, 2026-10-07 21:46.

## Related
- None
