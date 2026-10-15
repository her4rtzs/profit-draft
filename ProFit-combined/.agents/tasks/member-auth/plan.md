# Implementation Plan — Custom Member Authentication

Derived from the APPROVED design at `.agents/tasks/member-auth/design.md` (review: `.agents/tasks/member-auth/design-review.md`). Do not reopen resolved product decisions. Obey `AGENTS.md`: Django ORM only, business logic in services/models (not views), add/update tests for auth, never log PII/OTP/token/secrets, env-driven settings, daisyUI-first web UI, extend `base.html`, do not edit applied migrations (add new ones), Asia/Manila timezone.

## Environment notes for the implementer (read first)

- Use the project virtualenv: `.venv\Scripts\python.exe` on Windows (the system Python lacks `environ` and other deps). All `manage.py` commands below assume `.venv\Scripts\python.exe manage.py ...`. On POSIX use `.venv/bin/python manage.py ...`.
- Baseline confirmed before this plan: `.venv\Scripts\python.exe manage.py check` → "System check identified no issues (0 silenced)."
- Lint/format with `ruff check .` and `ruff format .` after edits.
- Record real verification output (commands + their actual output) to `.agents/tasks/member-auth/verification.md` as you complete items. Create that file in item 2 and append to it through the plan.
- Confirmed facts: `requests` is NOT a dependency — the Resend backend must use stdlib `urllib.request`. Argon2 is the default hasher (`argon2-cffi==23.1.0` installed). `apps/accounts/migrations/0001_initial.py` exists; add `0002`, never edit `0001`. Vendored Lucide SVGs present: `user.svg`, `users.svg`, `calendar-check.svg`, `menu.svg`, `search.svg`. The `icon` component (`components/icon/icon.py`) reads `static/vendor/lucide/<name>.svg` and renders empty for unknown names. The `User` model (`apps/accounts/models.py`) extends `AbstractUser` and adds `role` (choices from `Role`); `username` is unique, `email` is not.

---

- [ ] 1. Add the two new models `EmailOTP` and `StaffInvite` to `apps/accounts/models.py`.
      `EmailOTP`: FK `user` (CASCADE, `related_name="email_otps"`), `code_hash` CharField(128), `purpose` CharField(20, choices with `SIGNUP`), `created_at` DateTimeField(default=`timezone.now`), `expires_at` DateTimeField, `attempts` PositiveSmallIntegerField(default=0), `consumed_at` DateTimeField(null/blank). Class constants `MAX_ATTEMPTS=5`, `TTL=timedelta(minutes=10)`, `RESEND_COOLDOWN=timedelta(seconds=60)`. Methods `is_expired(now)`, `is_consumed()`, `is_usable(now)`. Add `Meta.indexes = [models.Index(fields=["user","purpose","created_at"])]`. No unique constraint on `user`.
      `StaffInvite`: `email` EmailField, `role` CharField(20, choices=`Role.choices`), `token_hash` CharField(128), `invited_by` FK(User, PROTECT, `related_name="sent_invites"`), `created_at` DateTimeField(default=`timezone.now`), `expires_at` DateTimeField, `used_at` DateTimeField(null/blank), `accepted_user` FK(User, null/blank, SET_NULL, `related_name="+"`). Class constant `TTL=timedelta(hours=72)`. Methods `is_expired(now)`, `is_used()`, `is_usable(now)`, and `clean()` raising `ValidationError` if `role not in {Role.CASHIER, Role.TRAINER}`.
      Files: `apps/accounts/models.py`
      Verify: `.venv\Scripts\python.exe manage.py makemigrations accounts --name emailotp_staffinvite` creates `apps/accounts/migrations/0002_emailotp_staffinvite.py`; then `.venv\Scripts\python.exe manage.py check` reports no issues. Confirm `0001_initial.py` is unchanged.

- [ ] 2. Confirm/commit the generated migration and start the verification log.
      Confirm `apps/accounts/migrations/0002_emailotp_staffinvite.py` only creates the two new tables (no `User` table alteration). Create `.agents/tasks/member-auth/verification.md` and paste the actual output of `makemigrations`, `migrate`, and `check`.
      Files: `apps/accounts/migrations/0002_emailotp_staffinvite.py` (generated), `.agents/tasks/member-auth/verification.md`
      Verify: `.venv\Scripts\python.exe manage.py migrate` applies `0002` with no errors; `.venv\Scripts\python.exe manage.py check` passes. Record both outputs in `verification.md`.

- [ ] 3. Add the custom Resend email backend in `apps/accounts/email_backends.py`.
      Module-top imports limited to stdlib (`json`, `logging`, `urllib.request`, `urllib.error`) and `django.core.mail.backends.base.BaseEmailBackend` + `django.core.exceptions.ImproperlyConfigured` — NO model imports (this module is imported during settings evaluation). Implement `select_email_backend(resend_api_key, debug) -> str`: return `"apps.accounts.email_backends.ResendEmailBackend"` when key set; return `"django.core.mail.backends.console.EmailBackend"` when no key and `debug` True; raise `ImproperlyConfigured` when no key and `debug` False. Implement `ResendEmailBackend(BaseEmailBackend)` whose `send_messages(email_messages)` POSTs each message to `https://api.resend.com/emails` via `urllib.request.Request` with `Authorization: Bearer <key>` and `Content-Type: application/json`, body `{"from","to","subject","text"/"html"}`, 10s timeout. On `URLError`/timeout/non-2xx/missing-key: log `WARNING event=resend_send_failed` with HTTP status only (NEVER recipient/subject/body) and raise a custom exception. Define `EmailDeliveryError` here (or import it; keep one canonical definition — see item 6 note) and read the API key from settings inside `__init__`/send (not at import time).
      Files: `apps/accounts/email_backends.py`
      Verify: deferred to item 15 unit tests; for now `.venv\Scripts\python.exe manage.py check` still passes after item 5 wires settings.

- [ ] 4. Add the email send helpers in `apps/accounts/emails.py`.
      `send_otp_email(user, code)` and `send_invite_email(invite, raw_token, accept_url)`: build subject + plain-text (and minimal HTML) body, call `django.core.mail.send_mail(..., fail_silently=False)` so a backend `EmailDeliveryError` propagates to the service caller. These helpers persist nothing and must never log `code`, `raw_token`, or `user.email`/`invite.email`.
      Files: `apps/accounts/emails.py`
      Verify: covered by item 15 tests; `manage.py check` passes.

- [ ] 5. Wire settings and `.env.example`.
      In `profit/settings.py` add (after the DEBUG read, and importing `select_email_backend` from `apps.accounts.email_backends`): `RESEND_API_KEY = env("RESEND_API_KEY", default="")`, `DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="ProFit <onboarding@resend.dev>")`, `SITE_BASE_URL = env("SITE_BASE_URL", default="http://localhost:8000")`, `EMAIL_BACKEND = select_email_backend(RESEND_API_KEY, DEBUG)`, `LOGIN_URL = "/accounts/login/"`, `LOGIN_REDIRECT_URL = "/"`, `LOGOUT_REDIRECT_URL = "/"`. Append a `# Email (Resend)` block to `.env.example` after the PayMongo block with names + non-secret placeholders (`RESEND_API_KEY=`, `DEFAULT_FROM_EMAIL=ProFit <onboarding@resend.dev>`, `SITE_BASE_URL=http://localhost:8000`), one `#` comment per variable. Do NOT touch the pre-existing `SECRET_KEY`/`SUPABASE_KEY` lines.
      Files: `profit/settings.py`, `.env.example`
      Verify: `.venv\Scripts\python.exe manage.py check` passes with `DEBUG=True` (console backend selected). Record output in `verification.md`.

- [ ] 6. Add the RBAC helper `can_manage_staff_invites` to `apps/accounts/permissions.py`.
      Pure function matching the existing style: `if not _is_authenticated(user): return False` then `return user.role == Role.OWNER`. Add a docstring line. Do not change any existing helper. (Note on `EmailDeliveryError` placement from item 3: keep exactly one definition — either in `email_backends.py` imported by `services.py`, or in `services.py` imported by `email_backends.py`. Choose `services.py` as the canonical home and import it into `email_backends.py` lazily inside the method to avoid import-time model loading; if a circular import appears, define `EmailDeliveryError` in `email_backends.py` and import it into `services.py`.)
      Files: `apps/accounts/permissions.py`
      Verify: `.venv\Scripts\python.exe manage.py test apps.accounts.tests.test_permissions` still passes (no regression).

- [ ] 7. Add the services layer in `apps/accounts/services.py`.
      Implement, with business logic and transactions here (not in views):
      - `normalize_email(email) -> str` (strip + lowercase) — the single source of truth shared by signup and login.
      - Custom exceptions `OTPCooldownError`, `InvalidInviteError`, and `EmailDeliveryError` (canonical home per item 6). Frozen dataclasses `RegisterResult(pending_user_id, decoy=False)` and `VerifyResult(ok, reason)` where reason ∈ {`ok`,`bad_code`,`expired`,`consumed`,`capped`,`no_pending`}.
      - `register_member(email, password) -> RegisterResult`: validate email + `validate_password`; normalize; `User.objects.filter(email__iexact=...)` three branches: (1) none → create inactive `User(username=norm, email=norm, role=MEMBER, is_active=False)` in `transaction.atomic()`, `set_password`, then `issue_otp` + caller sends; wrap create/save in `try/except IntegrityError` to handle the `username` unique race by re-reading and falling through to branch 2/3; (2) existing inactive → re-issue OTP to that user (cooldown may suppress mail); (3) existing active → decoy (`RegisterResult(None, decoy=True)`), no user, no mail. All three return an observably identical result for the view.
      - `issue_otp(user, purpose) -> raw_code`: PERSIST ONLY. Enforce cooldown (raise `OTPCooldownError` if latest row within `RESEND_COOLDOWN`), generate 6-digit code via `secrets.randbelow(1_000_000)` zero-padded to 6 (so `000000` is valid), store `EmailOTP(code_hash=make_password(code), expires_at=now+TTL, purpose=...)`, return raw code. Never sends, never logs the code.
      - `send ownership`: `register_member` branch 1 and `resend_otp` each call `issue_otp` then `send_otp_email` exactly once and are the only catch sites for `EmailDeliveryError`.
      - `verify_otp(user, code) -> VerifyResult`: in `transaction.atomic()`, load latest `SIGNUP` row; map to `no_pending`/`consumed`/`expired`/`capped`; else `check_password`: match → set `consumed_at`, `user.is_active=True`, save both, return `ok`; mismatch → `attempts += 1`, return `capped` if it reaches `MAX_ATTEMPTS` else `bad_code`. Log only `capped` at `INFO event=otp_attempts_exceeded user_id=<id>` (id only).
      - `resend_otp(user)`: `issue_otp` then `send_otp_email`; catches `EmailDeliveryError`.
      - `create_staff_invite(*, owner, email, role) -> (StaffInvite, raw_token)`: assert `can_manage_staff_invites(owner)` else `PermissionDenied`; validate role ∈ {CASHIER, TRAINER} else `ValidationError`; normalize invitee email; `raw_token=secrets.token_urlsafe(32)`; store `token_hash=make_password(raw_token)`, `expires_at=now+TTL`.
      - `accept_invite(*, raw_token, invite_id, password) -> User`: load invite; `InvalidInviteError` if not `is_usable(now)`; constant-time `check_password(raw_token, invite.token_hash)` mismatch → `InvalidInviteError`; `validate_password`; `username=email=invite.email` (never from request); if that username already exists → `InvalidInviteError`; else in `transaction.atomic()` create `User(..., role=invite.role, is_active=True)`, `set_password`, set `invite.used_at`, `invite.accepted_user`.
      Files: `apps/accounts/services.py`
      Verify: covered by items 13–15 tests; `.venv\Scripts\python.exe manage.py check` passes.

- [ ] 8. Add validation-only forms in `apps/accounts/forms.py`.
      Django `Form`s (no persistence): `SignupForm` (email, password), `LoginForm` (email, password), `VerifyForm` (code — exactly 6 ASCII digits; non-digit/wrong-length treated as a failed attempt, no format oracle), `AcceptInviteForm` (password, confirm-password — NO email/role fields). Forms do field-level validation only; services own the rest.
      Files: `apps/accounts/forms.py`
      Verify: `manage.py check` passes; forms exercised by view tests in items 13–14.

- [ ] 9. Add the views in `apps/accounts/views.py` and URL wiring.
      Plain function views (not DRF), thin: parse form → call service → map result/exception to messages/redirect/render. `signup_view` (GET form, POST), `verify_view` (GET/POST), `resend_otp_view` (`@require_POST`, HTMX, always returns `_resend_status.html` at HTTP 200 with a `status` flag), `login_view` (GET/POST; normalize email then `authenticate(request, username=norm, password=...)`; validate `next` with `url_has_allowed_host_and_scheme`), `logout_view` (`@require_POST`), `accept_invite_view` (GET/POST at `<int:invite_id>/<token>/`). Enforce the session rules exactly: single key `request.session["pending_user_id"]` (+ `pending_decoy` flag), overwrite on new signup, pop before `login()` on success, redirect authenticated users out of the funnel, treat an already-active pending user as finished, decoy path renders the normal verify form and rejects any code generically. On signup `EmailDeliveryError`: still set pending_user_id, redirect to verify, add a `messages.warning`. Create `apps/accounts/urls.py` with `app_name = "accounts"` and the six paths from the design; include it in `profit/urls.py` via `path("accounts/", include("apps.accounts.urls"))`.
      Files: `apps/accounts/views.py`, `apps/accounts/urls.py`, `profit/urls.py`
      Verify: `.venv\Scripts\python.exe manage.py check` passes; `.venv\Scripts\python.exe manage.py runserver` not required, but a reverse check: run `test_signup_otp`/`test_login` in later items. Confirm `/api/auth/*` routes and existing URLConf are untouched.

- [ ] 10. Register the two models view-only in `apps/accounts/admin.py`.
      Register `EmailOTP` and `StaffInvite` with `ModelAdmin`s where `has_add_permission` and `has_change_permission` return `False`. `EmailOTP`: `list_display=("user","purpose","created_at","expires_at","consumed_at","attempts")`, `exclude=("code_hash",)`, `readonly_fields` omitting `code_hash`, no `search_fields` on the hash. `StaffInvite`: `list_display=("email","role","created_at","expires_at","used_at","invited_by")`, `token_hash` excluded from list and detail. Never expose either hash. Leave the existing `UserAdmin` unchanged.
      Files: `apps/accounts/admin.py`
      Verify: `.venv\Scripts\python.exe manage.py check` passes; load `/admin/` is optional, but confirm no admin errors via `check`.

- [ ] 11. Add the `invite_staff` management command (minimal Owner invite path).
      Create `apps/accounts/management/__init__.py`, `apps/accounts/management/commands/__init__.py`, and `apps/accounts/management/commands/invite_staff.py`. Command accepts `--email`, `--role`, `--owner <username>`: resolve the owner User, call `create_staff_invite(owner=..., email=..., role=...)`, build `accept_url = settings.SITE_BASE_URL.rstrip("/") + reverse("accounts:accept_invite", args=[invite.id, raw_token])`, call `send_invite_email(invite, raw_token, accept_url)`. On a non-Owner `--owner` or bad `--role`: raise `CommandError` (non-zero exit), create no invite. On `EmailDeliveryError`: print a non-PII error and exit non-zero while leaving the persisted invite usable. Never print the token or email body contents beyond what's needed; never log the raw token.
      Files: `apps/accounts/management/__init__.py`, `apps/accounts/management/commands/__init__.py`, `apps/accounts/management/commands/invite_staff.py`
      Verify: `.venv\Scripts\python.exe manage.py invite_staff --help` prints usage with no error; full behavior covered by item 14 tests.

- [ ] 12. Add templates and vendored icons.
      Create under `templates/accounts/` (each `{% extends "base.html" %}`, daisyUI card/form classes like `home.html`, every form includes `{% csrf_token %}`, use the `icon` component): `login.html`, `signup.html`, `verify.html` (HTMX resend button posting to `{% url 'accounts:resend_otp' %}` swapping the partial), `_resend_status.html` (switches on `status` ∈ sent/cooldown/send_failed/expired), `accept_invite.html`. Add vendored Lucide SVGs `static/vendor/lucide/mail.svg`, `lock.svg`, `log-in.svg` (same `<svg ...>` format as existing `user.svg`); if the "Create account" button uses a distinct glyph, add that SVG too (e.g. `user-plus.svg`) or reuse an already-vendored name. Update `templates/home.html`: change the Sign-in anchor `href` from `/admin/` to `{% url 'accounts:login' %}`, add a "Create account" anchor to `{% url 'accounts:signup' %}`, leave the `Staff portal` button and `/admin/` reachability untouched.
      Files: `templates/accounts/login.html`, `templates/accounts/signup.html`, `templates/accounts/verify.html`, `templates/accounts/_resend_status.html`, `templates/accounts/accept_invite.html`, `templates/home.html`, `static/vendor/lucide/mail.svg`, `static/vendor/lucide/lock.svg`, `static/vendor/lucide/log-in.svg` (+ any extra glyph used)
      Verify: `.venv\Scripts\python.exe manage.py check` passes; the signup→verify→login integration test in item 13 exercises template rendering (asserts 200 and expected content).

- [ ] 13. Add signup/OTP tests in `apps/accounts/tests/test_signup_otp.py`.
      Cover design tests 1–10, 21, 22, 23, 27 (follow the `test_session_auth.py` pattern; use `Client(enforce_csrf_checks=True)` for CSRF cases and `mail.outbox` for email assertions): inactive-member creation + one OTP + `len(mail.outbox)==1`; correct OTP activates + logs in + redirects to `/`; wrong OTP increments attempts, no activation; cap at 5 returns `capped` and a later correct submit still `capped`, plus `expired`/`consumed`/`bad_code`/`no_pending` all render the single generic copy; expired OTP rejected (time-travel past `expires_at`); single-use; 60s resend cooldown; OTP code never in logs and email not logged on Resend-failure path; CSRF 403 without token on signup/verify/resend; Resend failure surfaces user-facing error (no 500) and leaves resend usable; duplicate-email anti-enumeration (active → identical redirect, no second user, no mail; inactive → re-issue, no duplicate); decoy verify path; login via email normalization; duplicate-username race (simulate `IntegrityError`) → generic result, no 500, no duplicate.
      Files: `apps/accounts/tests/test_signup_otp.py`
      Verify: `.venv\Scripts\python.exe manage.py test apps.accounts.tests.test_signup_otp` → all tests pass. Record output in `verification.md`.

- [ ] 14. Add login and invite tests in `apps/accounts/tests/test_login.py` and `apps/accounts/tests/test_invite.py`.
      `test_login.py` (design tests 11–13): login succeeds for a verified active member (email normalized before `authenticate`); fails generically for inactive/unverified (no state disclosure); logout ends the session (CSRF-protected POST). `test_invite.py` (design tests 14–18, 24, 25, plus review NIT 1): only an Owner can `create_staff_invite` (non-Owner → `PermissionDenied`); accepting a valid invite sets password + activates with the Owner-chosen role, no role read from request, email/username from `invite.email`; expired token rejected; used token rejected (single-use); wrong/garbage token rejected; accept into an existing username refused; `call_command("invite_staff", ...)` (a) success with Owner `--owner` + `--role CASHIER` creates invite + one email, (b) non-Owner `--owner` → `CommandError`/non-zero + no invite, (c) invalid `--role` rejected, and on `EmailDeliveryError` the command exits non-zero but the invite row persists; plus a direct `StaffInvite(role=Role.OWNER, ...).full_clean()` raises `ValidationError`.
      Files: `apps/accounts/tests/test_login.py`, `apps/accounts/tests/test_invite.py`
      Verify: `.venv\Scripts\python.exe manage.py test apps.accounts.tests.test_login apps.accounts.tests.test_invite` → all pass. Record output in `verification.md`.

- [ ] 15. Add email backend tests in `apps/accounts/tests/test_email_backend.py`.
      Design tests 19, 20, 26: with `RESEND_API_KEY` set, `ResendEmailBackend` builds the expected request (monkeypatch `urllib.request.urlopen`/transport) and does not log recipient/subject/body; with no key the console backend path is selected and `mail.outbox` still works under the test runner; `select_email_backend("re_live_...", False)` and `(..., True)` both return the Resend dotted path, `select_email_backend("", True)` returns the console dotted path, `select_email_backend("", False)` raises `ImproperlyConfigured`.
      Files: `apps/accounts/tests/test_email_backend.py`
      Verify: `.venv\Scripts\python.exe manage.py test apps.accounts.tests.test_email_backend` → all pass. Record output in `verification.md`.

- [ ] 16. Full verification pass, lint, and format.
      Run the entire accounts suite and the config check, then lint/format. Fix any failures or lint errors before finishing.
      Files: (any touched above as needed for fixes)
      Verify: `.venv\Scripts\python.exe manage.py check` → no issues; `.venv\Scripts\python.exe manage.py test apps.accounts` → OK (all tests pass); `ruff check .` → no errors; `ruff format .` → clean. Paste the final real output of all four commands into `.agents/tasks/member-auth/verification.md`.

- [ ] 17. Append a session entry to `PROJECT-LOG.md` (per AGENTS.md).
      Append (never edit earlier entries) one entry using the AGENTS.md format: date-time `(Asia/Manila)`, title, "What I asked for" (custom login/signup with email-OTP verification + staff-invite foundation), "What the agent decided and why" (one bullet per non-obvious decision: plain views for CSRF, stdlib-urllib Resend backend, hashed OTP/token via Argon2, anti-enumeration generic responses, Owner-only invite via management command this pass), and "Decision-log skill". No secrets, PII, OTP, or tokens in the entry.
      Files: `PROJECT-LOG.md`
      Verify: `PROJECT-LOG.md` ends with the new entry and all prior entries are intact (diff shows an append only).

## Verification commands (summary)

- Config: `.venv\Scripts\python.exe manage.py check`
- Migrations: `.venv\Scripts\python.exe manage.py makemigrations accounts` / `migrate`
- Tests (whole app): `.venv\Scripts\python.exe manage.py test apps.accounts`
- Tests (one module): `.venv\Scripts\python.exe manage.py test apps.accounts.tests.test_signup_otp`
- Lint/format: `ruff check .` and `ruff format .`

All real command output must be recorded in `.agents/tasks/member-auth/verification.md`.

## Flagged assumptions carried from the design (do not re-decide)

- Signup creates only the auth `User`; `MemberProfile` creation stays with staff enrollment.
- `username == normalized email` for self-signup members; emails over 150 chars are rejected generically.
- Owner-facing invite dashboard UI is deferred; this pass ships the `invite_staff` management command + the invitee-facing accept page only.
- Pre-existing `.env.example` `SECRET_KEY`/`SUPABASE_KEY` values are out of scope; do not modify them.
