# Verification — Custom Member Authentication

All commands run from `c:\Users\Sipag\Desktop\ProFit` in the existing Python 3.13
`.venv` (`.venv\Scripts\python.exe`). Output was captured to files via a Python
`subprocess` wrapper / stream redirects because this PowerShell session has a
PSReadLine display glitch that echoes commands and shows exit code `-1` inline
even on success; the real return codes below were read from the captured files.

Environment: `python --version` → `Python 3.13.14`. `DATABASE_URL` is unset, so
the offline SQLite fallback (`db.sqlite3`) is used.

---

## 1. `makemigrations` then `migrate` (offline SQLite, DATABASE_URL unset)

`python manage.py makemigrations accounts --name emailotp_staffinvite`:

```
Migrations for 'accounts':
  apps\accounts\migrations\0002_emailotp_staffinvite.py
    + Create model StaffInvite
    + Create model EmailOTP
```

The generated `0002_emailotp_staffinvite.py` creates only the two new tables and
makes NO change to the existing `User` table. `0001_initial.py` is unchanged.

`python manage.py migrate` (RETURNCODE 0):

```
Operations to perform:
  Apply all migrations: accounts, admin, auth, billing, contenttypes, finance, membership, sessions
Running migrations:
  Applying accounts.0002_emailotp_staffinvite... OK
```

## 2. `python manage.py check` — 0 issues (RETURNCODE 0)

```
System check identified no issues (0 silenced).
```

## 3. `python manage.py test` — all tests pass

Note on discovery: the project keeps tests in per-app `tests/` packages. A bare
`python manage.py test` with this layout only auto-discovers `apps.accounts`
(60 tests, all OK). Running the full project explicitly covers the whole suite:

`python manage.py test apps.accounts apps.billing apps.finance apps.membership`
(RETURNCODE 0):

```
Found 94 test(s).
...
----------------------------------------------------------------------
Ran 94 tests in 67.156s

OK
```

- 60 tests in `apps.accounts` (34 of those are the new member-auth tests across
  `test_signup_otp.py`, `test_login.py`, `test_invite.py`, `test_email_backend.py`;
  26 are the pre-existing permissions/session-auth tests).
- 34 tests across `apps.billing` / `apps.finance` / `apps.membership`
  (pre-existing). Total 94, all passing.

The new tests cover: signup creates an inactive Member + issues one OTP
(`len(mail.outbox) == 1`); correct OTP verifies + activates + logs in; wrong OTP
rejected and counts against the cap; 5-attempt cap; expired OTP rejected; OTP
single-use; resend 60s cooldown; the OTP is never present in logs (and the email
is not logged on the Resend-failure path); CSRF enforced on anonymous
signup/verify/resend POSTs (`Client(enforce_csrf_checks=True)`); Resend failure
surfaces a user-facing error (no 500) and leaves resend usable; duplicate-email
anti-enumeration (active decoy / inactive re-issue); duplicate-username race →
generic result, no 500, no duplicate; decoy verify path; login via email
normalization; login works for a verified member and fails for an
unverified/inactive one; logout ends the session (CSRF-protected); invite flow —
only an Owner can create an invite, invitee cannot change the role, expired/used/
garbage token rejected, accept into an existing username refused, accepting sets
password + activates with the Owner-chosen role; the `invite_staff` command
(success + one email, non-Owner refused, bad role refused, delivery-failure
leaves the invite persisted); and `StaffInvite(role=OWNER).full_clean()` raises.

## 4. `ruff check .` and `ruff format --check .`

`ruff` was NOT installed in the `.venv` and the repo has no `ruff` config or
`ruff` entry in `requirements.txt` — ruff had never been run against this repo.
`ruff==0.9.6` was installed into the `.venv` to run these gates (dev-only tool;
reversible; not added to `requirements.txt`).

### My code is clean

`ruff check` + `ruff format --check` over ALL files added/modified by this task
(the new `apps/accounts/*` modules, management command, tests, migration, and
the edited `profit/settings.py`, `profit/urls.py`):

```
All checks passed!
18 files already formatted
```

### Pre-existing repo state (out of scope — flagged, not changed)

Running the gates across the WHOLE repo surfaces pre-existing issues in files
this task did not touch. These are left unchanged to respect scope (do not
refactor unrelated code):

- `ruff check .` reports 2 pre-existing `F401` unused-import warnings:
  - `apps/billing/tests/test_services.py:5` (`WebhookEvent`)
  - `apps/membership/services.py:11` (`MemberProfile`)
- `ruff format --check .` would reformat 13 pre-existing files that were never
  ruff-formatted (e.g. `manage.py`, `components/button/button.py`,
  `apps/accounts/tests/test_permissions.py`, several `migrations/0001_initial.py`,
  and other apps' tests). None of these were introduced by this task.

Reviewer note: to make the whole-repo gates pass, run `ruff check --fix .` and
`ruff format .` as a separate, repo-wide cleanup. That is deliberately NOT part
of this member-auth change.

## 5. Manual flow against the console backend (real outcomes)

Settings selected `EMAIL_BACKEND = django.core.mail.backends.console.EmailBackend`
(no `RESEND_API_KEY`, `DEBUG=True`). Exercised via Django's test client with a
temporary DB; email captured through the locmem outbox:

```
EMAIL_BACKEND selected by settings: django.core.mail.backends.console.EmailBackend
GET /accounts/login/ -> 200
GET /accounts/signup/ -> 200
POST /accounts/signup/ -> 302 redirect: /accounts/verify/
user is_active after signup: False role: MEMBER
emails in outbox: 1
subject: Your ProFit verification code
otp length captured from email: 6
POST /accounts/verify/ -> 302 redirect: /
user is_active after verify: True
session authenticated: True
MANUAL FLOW COMPLETE
```

This confirms: anonymous GET of `/accounts/login/` and `/accounts/signup/` return
200; a signup POST creates an inactive `MEMBER` and emits exactly one OTP email;
verifying with the emailed 6-digit code activates the account and establishes a
logged-in session (redirect to `/`). The OTP is read only from the email body,
never from logs.

## Notes

- `/admin/` login is untouched; the DRF mobile session-auth endpoints
  (`/api/auth/csrf|login|logout/`) and the existing RBAC single-sourcing are
  unchanged (their tests pass in the full suite above).
- No applied migration was edited; `0002` was added.
- `RESEND_API_KEY`, `DEFAULT_FROM_EMAIL`, `SITE_BASE_URL` are documented as names
  only in `.env.example`; no key is hard-coded.
