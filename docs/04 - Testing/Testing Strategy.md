# Testing Strategy

## Approach

Server-side behaviour is covered by Django's test runner; tests live beside the app they protect. The documented rule is that any change to billing, auth, permissions or enrollment ships with tests (`AGENTS.md`, "Rules"). Tests were **not run** during this documentation pass — see "Current status" below.

## Test locations

23 `test_*.py` modules under `apps/<app>/tests/`:

| App | Modules |
| --- | --- |
| `apps/accounts/` | `test_permissions.py`, `test_login.py`, `test_web_session.py`, `test_session_auth.py`, `test_invite.py`, `test_signup_otp.py`, `test_verify_password.py`, `test_password_reset.py`, `test_change_password.py`, `test_email_backend.py` |
| `apps/billing/` | `test_webhook.py`, `test_checkout.py`, `test_services.py` |
| `apps/membership/` | `test_services.py`, `test_api.py`, `test_staff_api.py`, `test_member_profile_edit.py` |
| `apps/finance/` | `test_dashboard.py`, `test_payments_api.py`, `test_payment_edit.py` |
| `apps/announcements/` | `test_announcements_api.py` |
| `apps/notifications/` | `test_notifications_api.py` |
| `apps/trainers/` | `test_trainers.py` |

There is no `pytest.ini`, `tox.ini`, `setup.cfg` or `pyproject.toml`; the runner is Django's own.

## Commands

| Purpose | Command | Evidence |
| --- | --- | --- |
| Run the suite | `python manage.py test` | `README.md` line 86, `AGENTS.md` |
| Validate configuration | `python manage.py check` | `README.md` line 85 |
| Lint / format | `ruff check . && ruff format .` | `README.md` line 89 (`ruff` is **not** in `requirements.txt` and not installed here) |

## Current status

Not run. `python manage.py test` cannot start in this environment: `django-environ` is not installed for the global interpreter (`ModuleNotFoundError: No module named 'environ'`), there is no `.venv/`, and no `db.sqlite3` exists. Installing dependencies or creating a virtualenv was not requested, so no test command was executed. Test results are therefore **Unknown**.

## Coverage gaps

- **No CI.** No `.github/` directory; nothing runs the suite or `ruff` automatically (`ROADMAP.md` phase 0, unchecked item).
- **No browser or end-to-end tests** in the repository. The static `web/` portal (HTML/CSS/JS) has no automated coverage; earlier UI checks in this repo's history were done manually or with ad-hoc scripts outside the repo.
- **No coverage measurement** configured.
- **Not covered by the test tree:** the `pg_cron` expiry SQL (`supabase/cron/membership_expiry.sql`, applied manually), deployment/`vercel.json` build behaviour, WhiteNoise static serving, and PWA/service-worker behaviour (`web/sw.js`).
- **No load or timeout tests** for the serverless/Supabase pooler constraints (`ROADMAP.md` phase 6).

## Log backfill (facts stated in PROJECT-LOG.md, cited by entry date)

- Several test runs are recorded in the log: 94 tests with `manage.py check` at 0 issues (2026-10-10 21:35), 175 tests (2026-10-18 23:35), 45 + 8 tests after a merge (2026-11-13 20:25), 12 announcement tests (2026-11-14 01:05), and 206 tests passing at the 2026-11-19 CSS cleanup. The "tests were not run" lines above describe the older 2026-10-30 documentation pass, not the current state.
- Templates that extend `base.html` need a `STORAGES` override to plain `StaticFilesStorage` in tests, because the collectstatic manifest is a deploy artifact absent locally. (`PROJECT-LOG.md`, 2026-10-07 21:30; 2026-10-10 19:45.)
- `membership.E001` is a system check that actually renders a component during `manage.py check`, with a negative control showing a broken loader fails the gate. (`PROJECT-LOG.md`, 2026-10-07 21:15.)
- The login POST is tested with `Client(enforce_csrf_checks=True)` (403 without token, 200 with); RBAC is tested table-driven over `SimpleNamespace` stand-ins plus a test-only `ROOT_URLCONF` with the real permission adapters. (`PROJECT-LOG.md`, 2026-10-07 21:46.)
- The webhook suite covers byte-exact signature, a duplicate-PROCESSED no-op with a mock spy and `WebhookEvent` count, and the concurrent-insert `IntegrityError` recovery path. (`PROJECT-LOG.md`, 2026-10-07 21:30 and 21:46.)
- Member check-in tests cover success, same-day idempotency, inactive-membership rejection and persistence in `GET /api/member/me/`. (`PROJECT-LOG.md`, 2026-11-08 12:57.)
- `profit/tests/test_installable.py` checks the manifest content type and values for an anonymous client, that icons are real PNGs of the right size, that **every** `web/**/*.html` head carries the manifest link and theme tags, and that no service-worker file exists. (`PROJECT-LOG.md`, 2026-11-16 11:00 and 12:10.)
- Visual checks in the log used Playwright screenshots; no committed browser/E2E suite is recorded. The Phase 4.5 phone check is a manual gate the owner must run. (`PROJECT-LOG.md`, 2026-11-14 01:05; 2026-11-16 11:00.)

## Not yet inspected

- Individual test bodies (module names and counts were verified; assertions were not read).
- Test execution time, flakiness, and whether the suite passes on the pinned Django 5.1.4.
