# Custom member authentication: email-OTP signup, member login, Owner staff-invite foundation

Adds server-rendered HTML auth pages for Members (`/accounts/signup`, `/verify`, `/resend`, `/login`, `/logout`) plus the backend foundation for an Owner-initiated staff invite (`/accounts/invite/accept/...` page + an `invite_staff` management command). Public self-signup creates an inactive `MEMBER` and emails a hashed 6-digit OTP; the account activates only on correct verification. Staff accounts are never self-registered — an Owner issues a signed, single-use invite link that fixes the role. Everything is additive: the DRF mobile session-auth endpoints and `/admin/` login are untouched, and a new migration (`0002`) only creates the two new tables.

Watch for: nothing blocking. The one behavioral note worth a glance is that invite emails are not length-capped to the 150-char username limit (**possible**, trusted-Owner edge case) — an over-length invite email would raise at accept time rather than being rejected cleanly. The pre-existing `.env.example` real-looking `SECRET_KEY`/`SUPABASE_KEY` values are out of scope here and were correctly left untouched.

**Verdict**: APPROVED

## High-level view

Signup, login, and the invite-accept pages are plain Django function views, not DRF `APIView`s, so `CsrfViewMiddleware` protects the anonymous POSTs. Every form template carries `{% csrf_token %}`, and the CSRF path is tested with `Client(enforce_csrf_checks=True)`. The DRF endpoints the mobile app depends on (`GET /api/auth/csrf/`, `POST /api/auth/login/`, `/api/auth/logout/`) are unchanged.

The public signup path only ever constructs `User(role=Role.MEMBER, is_active=False)`. Staff roles come exclusively from an Owner-issued `StaffInvite` whose role is validated to `CASHIER`/`TRAINER` at issue time and read from the invite (never the request) at accept time. Owner-only issuance is single-sourced through `permissions.can_manage_staff_invites` and re-checked in the service.

OTP secrets and invite tokens are stored only as Argon2 hashes via `make_password`, verified with constant-time `check_password`. OTPs are 6 random digits (`secrets.randbelow`), 10-minute TTL, 5-attempt cap, 60-second resend cooldown, single-use (`consumed_at`), and the account stays inactive until a correct code lands. Nothing sensitive reaches the logs: the only log lines are non-PII event tags (`otp_attempts_exceeded user_id=...`, `resend_send_failed status=...`).

Email delivery is abstracted behind `select_email_backend`: the stdlib-only `ResendEmailBackend` when `RESEND_API_KEY` is set, the console backend when it is absent under `DEBUG=True`, and a hard `ImproperlyConfigured` when absent under `DEBUG=False` (so OTPs can never print to production logs). No `requests` dependency was added. A Resend failure is caught at the service boundary and surfaced as a user-facing warning, never a 500.

Anti-enumeration is handled by making signup return an observably identical redirect across new / existing-inactive / existing-active (decoy) branches, including a handled `IntegrityError` race on the unique `username`. Login fails generically for bad creds and for inactive/unverified accounts alike.

<details>
<summary>Issues (2)</summary>

1. **Invite email length not capped** (possible, non-blocking) — `create_staff_invite` does not reject invitee emails longer than the 150-char `username` limit, so `accept_invite` would raise at `User.save()` instead of returning a clean `InvalidInviteError`. Trusted-Owner input, low impact; consider a length guard if staff emails can ever be long.
2. **Pre-existing `.env.example` secrets** (confirmed, out of scope) — `SECRET_KEY`/`SUPABASE_KEY` carry real-looking values. Predates this task and correctly untouched; flagged for rotation separately.

</details>

<details>
<summary>Details</summary>

### Members-only self-signup; staff only via Owner invite

`register_member` constructs `User(username=norm, email=norm, role=Role.MEMBER, is_active=False)` in every create branch — there is no code path by which the public signup form can set any other role or activate the account. The signup form (`SignupForm`) collects email + password only; no role field exists to tamper with.

Staff provisioning is entirely separate. `create_staff_invite` gates on `can_manage_staff_invites(owner)` (Owner-only) and validates `role in {CASHIER, TRAINER}` before persisting; `StaffInvite.clean()` independently rejects non-staff roles and is exercised directly by a `full_clean()` test. `accept_invite` derives `username`/`email` from `invite.email` and `role` from `invite.role` — never from the request — and the `AcceptInviteForm` has only password + confirm fields. An existing username short-circuits to `InvalidInviteError`, so an invite cannot re-role or reactivate an existing account.

The Owner-only invariant is single-sourced: `permissions.can_manage_staff_invites` is the one policy function, the service re-checks it (defense in depth), and the `invite_staff` command maps a non-Owner `--owner` to a `CommandError`. The design explicitly defers the Owner-facing HTTP issue view, so the adapter-level HTTP gating is intentionally not exercised this pass; Owner enforcement is covered at the service and command layers instead. This is a documented, deliberate scope boundary, not a gap.

### OTP lifecycle and hashing

```
issue_otp:  secrets.randbelow(1_000_000) -> "%06d" -> make_password (Argon2) -> EmailOTP row
            cooldown: reject if latest row younger than RESEND_COOLDOWN (60s)
verify_otp: select_for_update latest SIGNUP row
            no row -> no_pending | consumed -> consumed | expired -> expired
            attempts >= 5 -> capped
            check_password match -> consume + activate; else attempts++ (-> capped at 5, else bad_code)
```

The plaintext code is never stored, returned to the HTTP layer, or logged — `issue_otp` returns it only so the single caller can hand it to `send_otp_email`. TTL (10 min), MAX_ATTEMPTS (5), and RESEND_COOLDOWN (60s) are model constants. `verify_otp` runs under `transaction.atomic()` with `select_for_update`, so concurrent verifies on the same row serialize rather than racing the attempt counter. The `000000` code is valid and non-special-cased, consistent with the "exactly 6 ASCII digits" verify rule in `VerifyForm.clean_code`.

The `VerifyResult(ok, reason)` dataclass lets the view distinguish `capped` (shows "too many attempts") from every other failure, which all collapse to one generic "invalid or expired" message so a client cannot tell a wrong code from an expired/consumed/absent one.

### No secrets in logs

The only log statements in the new code are `logger.info("event=otp_attempts_exceeded user_id=%s", user.id)` and `logger.warning("event=resend_send_failed status=%s", ...)` with the status being an integer HTTP code, `missing_key`, or `network_error`. No OTP code, invite token, email address, subject, or body is ever logged — confirmed by reading `services.py`, `emails.py`, and `email_backends.py`, and asserted by a test that captures logs and checks the member email string is absent. The `send_otp_email`/`send_invite_email` helpers log nothing.

### Email abstraction and Resend fallback

`select_email_backend(resend_api_key, debug)` returns the `ResendEmailBackend` dotted path when a key is present, the console backend when absent under `DEBUG=True`, and raises `ImproperlyConfigured` when absent under `DEBUG=False`. That last branch is the important one: it makes a prod deploy without a key fail fast at settings import rather than silently printing OTP codes and recipient addresses to Vercel function logs. The key and `DEFAULT_FROM_EMAIL` are read from env in settings; nothing is hard-coded.

`ResendEmailBackend` POSTs to the Resend API using `urllib.request` with a 10s timeout and reads the key from settings at send time (not import time). `requests` appears nowhere in the code or `requirements.txt` — confirmed by search. On any transport error, timeout, non-2xx, or missing key it logs a status-only warning and raises `EmailDeliveryError`. That exception propagates through `send_mail(fail_silently=False)` to the service caller: `register_member` and `resend_otp` catch it, so signup returns `delivery_failed=True` (view adds a warning and still routes to verify) rather than 500ing, and resend renders the `send_failed` partial at HTTP 200.

### CSRF on the anonymous POST forms

All auth views are plain function views decorated with `@require_http_methods`/`@require_POST`, so `CsrfViewMiddleware` applies. `signup.html`, `login.html`, `verify.html` (both the verify form and the HTMX resend form), and `accept_invite.html` each include `{% csrf_token %}`. The CSRF rejection path is tested with `Client(enforce_csrf_checks=True)`. The DRF mobile endpoints remain the separate, already-tested CSRF-protected session-auth surface.

### Additivity and migration safety

`profit/urls.py` adds one `path("accounts/", ...)` include; the `/api/`, `/admin/`, membership, finance, and webhook routes are unchanged. `api/urls.py` still exposes `auth/csrf`, `auth/login`, `auth/logout` plus the router. `templates/home.html` repoints the existing "Sign in" anchor to `accounts:login` and adds a "Create account" link, leaving the `Staff portal` button and `/admin/` reachability intact. Migration `0002_emailotp_staffinvite` creates only `StaffInvite` and `EmailOTP` and makes no change to the `User` table; `0001_initial` is untouched.

### Verification evidence

`verification.md` records `makemigrations`/`migrate` applying only `0002`, `check` at 0 issues, and the full suite via `python manage.py test apps.accounts apps.billing apps.finance apps.membership` → **94 tests, OK** (60 in accounts = 34 new auth tests + 26 pre-existing; 34 across billing/finance/membership). The method-count spot-check across the suite is consistent with these numbers. ruff was not previously in the repo; it was installed dev-only (not added to `requirements.txt`) and reports the new/modified files clean (`All checks passed! 18 files already formatted`), with pre-existing whole-repo ruff findings explicitly left out of scope. The evidence is complete and credible; no suite re-run was necessary.

Not tested: the deferred Owner-facing invite HTTP view (does not exist this pass, documented); over-length invite email handling (see issue 1).

</details>

<details>
<summary>File map</summary>

- `apps/accounts/models.py` — add `EmailOTP`, `StaffInvite`, `OTPPurpose`; `User` unchanged
- `apps/accounts/services.py` — new: register/issue/verify/resend OTP, create/accept invite, `normalize_email`, custom exceptions
- `apps/accounts/emails.py` — new: `send_otp_email`/`send_invite_email` (send-only, no logging)
- `apps/accounts/email_backends.py` — new: `select_email_backend` + stdlib `ResendEmailBackend`
- `apps/accounts/forms.py` — new: validation-only signup/login/verify/accept forms
- `apps/accounts/views.py` — new: plain function views for the six routes
- `apps/accounts/urls.py` — new: `/accounts/` routes
- `apps/accounts/permissions.py` — add `can_manage_staff_invites` (Owner-only)
- `apps/accounts/admin.py` — view-only `EmailOTP`/`StaffInvite` admin, hashes excluded
- `apps/accounts/management/commands/invite_staff.py` — new: Owner-only invite create+send command
- `apps/accounts/migrations/0002_emailotp_staffinvite.py` — new: two tables, no `User` change
- `profit/settings.py` — `LOGIN_URL`/`REDIRECT`, email backend selection, Resend env vars
- `profit/urls.py` — include `apps.accounts.urls`
- `templates/accounts/*.html` — login/signup/verify/_resend_status/accept_invite
- `templates/home.html` — repoint Sign in, add Create account
- `static/vendor/lucide/{mail,lock,log-in,user-plus}.svg` — vendored icons
- `.env.example` — add Resend var names/placeholders
- `apps/accounts/tests/test_{signup_otp,login,invite,email_backend}.py` — new tests

Full diff: `git diff` in `c:\Users\Sipag\Desktop\ProFit`.

</details>
