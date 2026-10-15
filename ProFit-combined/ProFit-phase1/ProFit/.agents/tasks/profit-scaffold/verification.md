# Verification log

## FEAT-001 — Backend scaffold, settings, Vercel entry, apps/accounts (RBAC)

Environment: Windows, Python 3.13.14 in a local `.venv`, offline (no
`DATABASE_URL`, so the SQLite default is used; no network, no live Supabase or
PayMongo). Commands run from the repo root. The npm/Tailwind build is not
required for this FEAT's gate and was not run.

### 1. `python manage.py check`

```
System check identified some issues:

WARNINGS:
?: (staticfiles.W004) The directory 'C:\Users\Sipag\Desktop\ProFit\static\dist' in the STATICFILES_DIRS setting does not exist.
?: (staticfiles.W004) The directory 'C:\Users\Sipag\Desktop\ProFit\static\vendor' in the STATICFILES_DIRS setting does not exist.

System check identified 2 issues (0 silenced).
EXITCODE=0
```

Exit code 0. (The two W004 warnings were for the not-yet-populated
`static/dist` and `static/vendor` directories; empty placeholder directories
were added afterward so later re-runs are clean. These are build-output dirs
for the web-portal FEAT and are not part of FEAT-001's deliverables.)

### 2. `python manage.py makemigrations accounts`

```
Migrations for 'accounts':
  apps\accounts\migrations\0001_initial.py
    + Create model User
EXITCODE=0
```

Exactly one initial migration produced (`0001_initial`, Create model User).

### 3. `python manage.py migrate`

```
Operations to perform:
  Apply all migrations: accounts, admin, auth, contenttypes, sessions
Running migrations:
  Applying contenttypes.0001_initial... OK
  Applying contenttypes.0002_remove_content_type_name... OK
  Applying auth.0001_initial... OK
  Applying auth.0002_alter_permission_name_max_length... OK
  Applying auth.0003_alter_user_email_max_length... OK
  Applying auth.0004_alter_user_username_opts... OK
  Applying auth.0005_alter_user_last_login_null... OK
  Applying auth.0006_require_contenttypes_0002... OK
  Applying auth.0007_alter_validators_add_error_messages... OK
  Applying auth.0008_alter_user_username_max_length... OK
  Applying auth.0009_alter_user_last_name_max_length... OK
  Applying auth.0010_alter_group_name_max_length... OK
  Applying auth.0011_update_proxy_permissions... OK
  Applying auth.0012_alter_user_first_name_max_length... OK
  Applying accounts.0001_initial... OK
  Applying admin.0001_initial... OK
  Applying admin.0002_logentry_remove_auto_add... OK
  Applying admin.0003_logentry_add_action_flag_choices... OK
  Applying sessions.0001_initial... OK
EXITCODE=0
```

Applied cleanly on SQLite (exit code 0).

### 4. `python -c "from api.index import app"`

```
OK import api.index.app: <django.core.handlers.wsgi.WSGIHandler object at 0x0000026623CE12B0>
EXITCODE=0
```

The Vercel WSGI symbol imports (exit code 0).

### 5. Fail-fast check — `DEBUG=False` with `ALLOWED_HOSTS` unset

```
django.core.exceptions.ImproperlyConfigured: ALLOWED_HOSTS must be set when DEBUG=False. Refusing to fall back to localhost in a non-debug environment.
EXITCODE=1
```

Startup raises `ImproperlyConfigured` as required; with `DEBUG=True` (the local
default) the project runs with the `['localhost','127.0.0.1']` fallback (checks
1-4 above all ran under that default).

Result: all FEAT-001 acceptance criteria and verification commands pass.

## FEAT-002 — Membership Module 1 (models + services + DRF read API + staff web views + web portal shell)

Environment: Windows, Python 3.13.14 in the local `.venv`, offline (no
`DATABASE_URL`, so the SQLite default is used; no network, no live Supabase or
PayMongo). Commands run from the repo root. `django-components==0.100`. The
npm/Tailwind build is a deploy-bundle artifact only and is not part of this
FEAT's gate (the django-component render is proven directly below), so it was
not run offline.

### 1. `python manage.py makemigrations membership`

The initial membership migration was generated during implementation
(`apps/membership/migrations/0001_initial.py`: MemberProfile, Enrollment,
Attendance, plus the `unique_member_check_in_date` UniqueConstraint on
`(member, check_in_date)`). Re-running confirms there is nothing further to
generate:

```
No changes detected in app 'membership'
EXITCODE=0
```

### 2. `python manage.py migrate`

On a fresh SQLite database:

```
Operations to perform:
  Apply all migrations: accounts, admin, auth, contenttypes, membership, sessions
Running migrations:
  Applying contenttypes.0001_initial... OK
  ...
  Applying accounts.0001_initial... OK
  Applying admin.0001_initial... OK
  Applying admin.0002_logentry_remove_auto_add... OK
  Applying admin.0003_logentry_add_action_flag_choices... OK
  Applying membership.0001_initial... OK
  Applying sessions.0001_initial... OK
EXITCODE=0
```

The single `membership.0001_initial` migration applies cleanly (exit code 0).

### 3. `python manage.py check`

```
System check identified no issues (0 silenced).
EXITCODE=0
```

Exit code 0. A custom system check (`apps/membership/checks.py`,
`membership.E001`) renders the example `button` django-component during
`manage.py check`; it passes here, which means the component rendered to
non-empty output. Direct render smoke test confirms the output:

```
RENDERED=[<button type="button" class="btn btn-primary ">Save</button>]
ICON_NONEMPTY=True
```

Negative control — a WRONG `django-components==0.100` loader path fails the
gate. Removing the `django_components.template_loader.Loader` from
`TEMPLATES[0]['OPTIONS']['loaders']` and re-running the same check:

```
ERRORS=['membership.E001']
FAILS_AS_EXPECTED=True
```

So an incorrect loader wiring makes `manage.py check` fail (exit nonzero), as
required by the acceptance criterion.

### 4. `python manage.py test apps.membership`

```
test_attendance_returns_empty_list_for_profile_less_user ... ok
test_member_cannot_read_another_members_attendance ... ok
test_me_returns_404_for_profile_less_user ... ok
test_me_returns_own_profile ... ok
test_enroll_activates_member ... ok
test_enroll_rejects_end_not_after_start_without_db_write ... ok
test_record_attendance_is_idempotent_same_manila_day ... ok
test_save_materializes_check_in_date ... ok

----------------------------------------------------------------------
Ran 8 tests in 6.606s

OK
FAILURES_COUNT=0
RESULT=OK
```

All 8 tests pass. They cover the authoritative acceptance criteria:

- `GET /api/membership/me/` returns `404 {'detail': 'No member profile.'}` for a
  profile-less user and the caller's own profile when present.
- `GET /api/attendance/` returns `200 []` for a profile-less user, and a member
  cannot read another member's attendance (strict queryset scoping to the
  caller's own `MemberProfile`, with `CanViewAttendance` guarding object reads).
- `record_attendance` is idempotent for the same Manila day (a second check-in
  hours later resolves to the original row), and `Attendance.save()`
  materializes `check_in_date`.
- `enroll_member` raises `ValidationError` with no DB write when
  `end_date <= start_date` (atomic rollback), and activates the member on
  success.

(The only non-error output during the run is a benign `UserWarning: No
directory at ...\staticfiles\` because `collectstatic` is a deploy-time step not
needed for tests.)

Result: all FEAT-002 acceptance criteria and verification commands pass.


## FEAT-003 � Billing Module 2 (webhook) + Finance Module 3 + pg_cron stub

Environment: Windows, Python 3.13.14 in a local `.venv`, offline (no
`DATABASE_URL`, so the SQLite default is used; no network, no live Supabase or
PayMongo). Commands run from the repo root. The DB and the fresh billing/finance
migrations were removed first so the output below is the genuine first-run.

### 1. `python manage.py makemigrations billing finance`

```
Migrations for 'billing':
  apps\billing\migrations\0001_initial.py
    + Create model WebhookEvent
    + Create model Subscription
    + Create model Payment
Migrations for 'finance':
  apps\finance\migrations\0001_initial.py
    + Create model TransactionRecord
```

One migration each, as required.

### 2. `python manage.py migrate`

```
Operations to perform:
  Apply all migrations: accounts, admin, auth, billing, contenttypes, finance, membership, sessions
Running migrations:
  ...
  Applying membership.0001_initial... OK
  Applying billing.0001_initial... OK
  Applying finance.0001_initial... OK
  Applying sessions.0001_initial... OK
```

Both new migrations apply cleanly on SQLite.

### 3. `python manage.py check`

```
System check identified no issues (0 silenced).
```

Exit 0 with the webhook route (`/webhooks/paymongo/`) and the finance dashboard
(`/finance/`) wired.

### 4. `python manage.py test apps.billing apps.finance`

```
Found 21 test(s).
System check identified no issues (0 silenced).
.....................
----------------------------------------------------------------------
Ran 21 tests in 4.514s

OK
```

All 21 tests pass. Coverage of the FEAT-003 acceptance criteria:
- `verify_signature` hashes `t.encode() + b'.' + raw_body` byte-exact and never
  decodes the raw body (a non-UTF-8 body test proves this); valid test-mode
  (`te`) and live-mode (`li`) signatures pass, tampered/malformed/missing
  headers fail; comparison is constant-time (`hmac.compare_digest`).
- The webhook is the only paid/failed writer, routed through the single-writer
  mutators; a `payment.paid` event processes to `PROCESSED`, an unknown payment
  is `200` + `UNKNOWN_PAYMENT` and reprocesses once the Payment exists, an
  unrecognized type is `200` + `IGNORED`, a bad signature is `400` with no
  `WebhookEvent` row, an unparseable body is `400`, a true duplicate short-
  circuits `200` without re-applying, and `GET` is `405`.
- `mark_payment_paid` / `mark_payment_failed` no-op on a stale/illegal
  transition (failed-after-paid and paid-after-failed stay settled);
  `create_payment_intent` raises `NotImplementedError`.
- The finance dashboard is `302`-to-login for anonymous, `403` for a non-Owner
  role, and `200` for an Owner.

(Benign run noise: a `UserWarning: No directory at ...\staticfiles\` because
`collectstatic` is a deploy-time step not needed for tests, and a logged
`PermissionDenied` traceback from the intentional non-Owner `403` test. The
`NativeCommandError` line is PowerShell flagging Django's normal stderr test
progress, not a failure.)

Result: all FEAT-003 acceptance criteria and verification commands pass.

## FEAT-004 — RBAC matrix + webhook suite + mobile skeleton + session-auth endpoints (final full-suite verification)

Environment: Windows, Python 3.13.14 in the local `.venv`, offline (no
`DATABASE_URL`, so the SQLite default is used; no network, no live Supabase or
PayMongo). Commands run from the repo root. The npm/Expo build is not required
for the backend gate and was not run (the mobile skeleton is config + source
only this pass).

This is the authoritative final verification for the scaffold. The per-FEAT
notes above are retained for history.

### 1. `python manage.py test apps.accounts apps.billing`

```
Found 44 test(s).
System check identified no issues (0 silenced).
...
----------------------------------------------------------------------
Ran 44 tests in 10.871s

OK
```

All 44 tests pass. New FEAT-004 coverage in these two apps:

- `apps/accounts/tests/test_permissions.py` — a table-driven matrix asserting
  every RBAC helper for all four roles (Owner/Cashier/Trainer/Member), the
  self-vs-other distinction for `can_initiate_payment`, `can_view_attendance`,
  and `can_edit_own_profile`, and that an anonymous/`None` user yields `False`
  for every helper. Enforcement is proven through BOTH adapters: the VIEW
  adapter (`role_required`) — a wrong-role authenticated user gets `403` and an
  anonymous user is redirected to `LOGIN_URL` (`/accounts/login/?next=...`) —
  and the DRF adapter (`CanViewFinancials` / `CanManageEnrollment` /
  `CanViewAttendance` via `APIClient` against a test-only URLconf), e.g. a
  Cashier is denied financials on both surfaces.
- `apps/accounts/tests/test_session_auth.py` — the mobile binding sequence:
  `GET /api/auth/csrf/` sets the `csrftoken` cookie; `POST /api/auth/login/`
  is CSRF-protected (403 without the token, 200 with the echoed `X-CSRFToken`
  header), there is NO CSRF-exempt login endpoint; bad credentials -> 401, a
  malformed body -> 400, `GET` on login -> 405; and an authenticated session
  can then read `/api/membership/me/` and `/api/attendance/`.
- `apps/billing/tests/test_webhook.py` (now the exhaustive suite) — byte-exact
  signature (`t.encode() + b'.' + raw_body`), `te` vs `li` selection, tampered
  / malformed / missing / empty-secret failures, raw-body-not-decoded; and the
  idempotency contract: valid+new -> 200 + PROCESSED; a duplicate PROCESSED
  delivery -> 200 no-op with the single-writer mutator NOT re-called (mock spy)
  and no extra `WebhookEvent` row; the concurrent-insert `IntegrityError` path
  -> 200 no-op (simulated so the `except IntegrityError` branch runs);
  UNKNOWN_PAYMENT -> retry after the Payment exists -> PROCESSED (the race fix);
  an unrecognized type -> 200 + IGNORED with a redelivery short-circuiting as a
  terminal duplicate; an invalid signature -> 400 with NO `WebhookEvent` row.

### 2. `python manage.py test` (full suite)

```
Found 55 test(s).
System check identified no issues (0 silenced).
...
----------------------------------------------------------------------
Ran 55 tests in 18.017s

OK
```

The full backend suite passes offline on SQLite.

### 3. `python manage.py check`

```
System check identified no issues (0 silenced).
```

Exit 0 offline on Python 3.13.

(Benign run noise, unchanged from earlier FEATs: a `UserWarning: No directory
at ...\staticfiles\` because `collectstatic` is a deploy-time step not needed
for tests; logged `WARNING`/`Bad Request`/`Forbidden`/`Not Found` lines emitted
by the intentional negative-path tests; and `System.Management.Automation.
RemoteException` lines, which are PowerShell flagging Django's normal stderr
test-progress stream, not failures.)

Result: all FEAT-004 acceptance criteria and verification commands pass. The
mobile skeleton (`mobile/`) ships NativeWind + react-native-reusables +
lucide-react-native with one `MembershipScreen` driving the binding four-step
auth sequence; `mobile/README.md` documents the exact sequence (SessionAuth
only, no CSRF-exempt login endpoint).

## Cross-FEAT integration verification (all four FEATs together)

Environment: Windows, Python 3.13.14 in the local `.venv`, offline (no
`DATABASE_URL`, so the SQLite default is used; no network, no live Supabase or
PayMongo). Commands run from the repo root with all four FEATs present and
committed. This is the whole-scaffold gate: it confirms the seams between
`apps/accounts`, `apps/membership`, `apps/billing`, `apps/finance`, and the
plain `api/` module hold together — URL wiring, `INSTALLED_APPS`, cross-app
imports, and migration consistency — with no per-app selection.

### 1. `python manage.py check`

```
System check identified no issues (0 silenced).
EXITCODE=0
```

Exit 0. This run executes the custom `membership.E001` system check
(`apps/membership/checks.py`), which renders the example `button`
django-component during `manage.py check` and fails the gate on empty output —
so a passing `check` is proof the component still renders under the
`django-components==0.100` loader wiring, with every app installed.

### 2. `python manage.py test` (full suite)

```
Found 55 test(s).
System check identified no issues (0 silenced).
...
----------------------------------------------------------------------
Ran 55 tests in 20.448s

OK
Destroying test database for alias 'default'...
EXITCODE=0
```

The full backend suite passes offline on SQLite (55 tests, exit 0). No seam
fixes were required this iteration: all cross-app URL includes resolve
(`/api/`, `/membership/`, `/finance/`, `/webhooks/paymongo/`, `/api/auth/*`),
`INSTALLED_APPS` carries all four dotted app labels, the migration graph
(`accounts` -> `membership` -> `billing`/`finance`) applies cleanly in one
pass, and the RBAC helpers, the single-writer payment mutators, and the DRF
read API all interoperate as the per-FEAT suites assert.

(Benign run noise, unchanged from earlier FEATs: a `UserWarning: No directory
at ...\staticfiles\` because `collectstatic` is a deploy-time step not needed
for tests; and logged `WARNING`/`Bad Request`/`Forbidden`/`Not Found` lines
plus two `PermissionDenied` tracebacks emitted by the intentional negative-path
RBAC and webhook tests — these are asserted outcomes of passing tests, not
failures.)

Result: the cross-FEAT integration gate is green. `python manage.py check` and
the full `python manage.py test` both pass offline on Python 3.13.14; the
scaffold is internally consistent across all four FEATs.
