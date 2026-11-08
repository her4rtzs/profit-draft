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
| Mobile | `npm test` (in `mobile/`) | `mobile/package.json` — the script is a stub: `echo "No tests yet (skeleton pass)" && exit 0` |

## Current status

Not run. `python manage.py test` cannot start in this environment: `django-environ` is not installed for the global interpreter (`ModuleNotFoundError: No module named 'environ'`), there is no `.venv/`, and no `db.sqlite3` exists. Installing dependencies or creating a virtualenv was not requested, so no test command was executed. Test results are therefore **Unknown**.

## Coverage gaps

- **No CI.** No `.github/` directory; nothing runs the suite or `ruff` automatically (`ROADMAP.md` phase 0, unchecked item).
- **No browser or end-to-end tests** in the repository. The static `web/` portal (HTML/CSS/JS) has no automated coverage; earlier UI checks in this repo's history were done manually or with ad-hoc scripts outside the repo.
- **No mobile tests.** `mobile/` ships one screen and a stub test script (`ROADMAP.md` phase 5: "Not started").
- **No coverage measurement** configured.
- **Not covered by the test tree:** the `pg_cron` expiry SQL (`supabase/cron/membership_expiry.sql`, applied manually), deployment/`vercel.json` build behaviour, WhiteNoise static serving, and PWA/service-worker behaviour (`web/sw.js`).
- **No load or timeout tests** for the serverless/Supabase pooler constraints (`ROADMAP.md` phase 6).

## Not yet inspected

- Individual test bodies (module names and counts were verified; assertions were not read).
- Test execution time, flakiness, and whether the suite passes on the pinned Django 5.1.4.
