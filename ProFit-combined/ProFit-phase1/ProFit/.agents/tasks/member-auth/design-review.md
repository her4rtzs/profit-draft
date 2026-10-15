# Design Review — Custom Member Authentication

Reviewed: `.agents/tasks/member-auth/design.md`
Scope: verified against `AGENTS.md`, `apps/accounts/{models,permissions,adapters,admin}.py`, `api/auth.py`, `api/urls.py`, `profit/settings.py`, `profit/urls.py`, `templates/home.html`, `components/icon/icon.py`, `.env.example`, `requirements.txt`, and the existing migrations/tests layout.

Verdict: **APPROVED** (0 HIGH, 0 MEDIUM; NITs only).

The design is a third-round revision that resolves the prior review findings. Every binding requirement from the gate is concretely and correctly specified, and the design's claims about the real codebase check out. The remaining items below are NITs — none blocks implementation.

---

## Binding-requirement check

1. **Public self-signup = MEMBERS ONLY; staff via Owner invite; Owner bootstrapped out of band.** MET.
   `register_member` hard-codes `role=Role.MEMBER` and `is_active=False`; staff accounts only exist via `create_staff_invite` + `accept_invite`, whose role comes from `invite.role` (never the request) and is validated to `{CASHIER, TRAINER}`. Owner is the bootstrapped superuser logging in via `/admin/`. The "invitee cannot choose role" and "only Owner issues" invariants are placed in service+model and the RBAC layer respectively.

2. **Email abstraction: Resend HTTP when key set, console fallback when absent; key + From from env; names in `.env.example`; no `requests` dep; Resend failure must not 500.** MET.
   - `requests` is confirmed ABSENT from `requirements.txt`; the design uses `urllib.request` in a custom `ResendEmailBackend`. ✓
   - `select_email_backend(resend_api_key, debug)` returns Resend when key present, console only when `DEBUG=True`, and raises `ImproperlyConfigured` when key absent AND `DEBUG=False` (prevents OTP/PII leak to Vercel logs). This matches the project's existing fail-fast patterns in `settings.py` (ALLOWED_HOSTS, DB pooler advisory).
   - Env names `RESEND_API_KEY`, `DEFAULT_FROM_EMAIL`, `SITE_BASE_URL` documented for `.env.example` with non-secret placeholders.
   - Delivery failure path: `ResendEmailBackend` raises `EmailDeliveryError`; the single catch site (service callers) converts it to a user-facing message; signup still persists the inactive user and redirects to verify. Never 500. ✓

3. **OTP: 6-digit numeric, 10-min expiry, HASHED, attempt cap, resend cooldown, single-use, inactive-until-verified; never logged.** MET.
   `secrets.randbelow(1_000_000)` zero-padded (correctly yields `000000`–`999999`); `code_hash = make_password(code)` (Argon2, confirmed default + `argon2-cffi==23.1.0` installed); `TTL=10min`; `MAX_ATTEMPTS=5`; `RESEND_COOLDOWN=60s`; `consumed_at` enforces single-use; `is_active` flips only on verify. Logging rule: only `reason="capped"` logs `INFO` with user id; code/email never logged.

4. **HTML pages under /accounts/ are PLAIN Django views (CSRF middleware applies); session login on success; DRF mobile auth + RBAC single-sourcing untouched.** MET.
   The design mirrors the exact reasoning documented in `api/auth.py` (plain views so `CsrfViewMiddleware` protects anonymous POSTs; DRF `SessionAuthentication` would skip CSRF for anonymous callers). Views are function-based with `@require_http_methods`/`@require_POST`; `login(request, user)` on success. Existing `GET/POST /api/auth/{csrf,login,logout}/` and the RBAC single-sourcing in `permissions.py` are explicitly left untouched; the new RBAC helper is additive.

5. **Invite modeled (email, role, token hash, expiry, used-at); Owner-only issuance single-sourced; role not invitee-selectable; accept sets password + activates + logs in; minimal create+send path if UI deferred (deferral documented).** MET.
   `StaffInvite` has `email`, `role`, `token_hash`, `expires_at`, `used_at`, plus `invited_by`/`accepted_user`. Owner-only gate via new `can_manage_staff_invites` in `permissions.py` (single-sourced), re-checked in the service. Accept form collects password + confirm only; email/role read from the invite. Minimal path = `manage.py invite_staff` management command; the Owner UI deferral is explicitly documented in "Owner invite-create (minimal path this pass)" and Open Questions, including that adapter-level HTTP gating is intentionally untested this pass (covered at command + service layers instead).

6. **Tests enumerated to cover all of the above.** MET.
   27 enumerated tests across `test_signup_otp.py`, `test_login.py`, `test_invite.py`, `test_email_backend.py` cover: inactive-member creation, OTP verify success/wrong/expired/consumed/cap, cooldown, no-log assertions, CSRF enforcement, delivery-failure non-500, anti-enumeration decoy, username-race (27), normalization login, invite role-fixing/expiry/single-use/constant-time, existing-username refusal, management-command surface, and `select_email_backend` branches incl. the `ImproperlyConfigured` raise.

---

## Findings

1. **NIT — `clean()` vs `.create()` is noted but no test asserts the model-level guard.** `StaffInvite` section.
   The design says `clean()` rejects a bad role and the service re-checks because `clean()` isn't called on `.create()`. Tests 14/25 cover the service/command role rejection, but no test exercises `StaffInvite.full_clean()` directly. Concrete fix: add a one-line assertion to `test_invite.py` that `StaffInvite(role=Role.OWNER, ...).full_clean()` raises `ValidationError`, so the model guard doesn't silently rot.

2. **NIT — `send_invite_email`/`EmailDeliveryError` behavior in the management command is unspecified.** "Owner invite-create" + error-handling table.
   The error table and send-ownership rules cover the OTP paths and name `create_staff_invite`/"the invite command" as a catch site, but the command's user-facing behavior on `EmailDeliveryError` (exit code, message, whether the invite row is kept) isn't stated the way the signup path is. Concrete fix: specify that `invite_staff` prints a non-PII error and exits non-zero on `EmailDeliveryError` while leaving the persisted invite usable (symmetric with the signup "row persists, resend later" rule), and add an assertion to test 25.

3. **NIT — `SITE_BASE_URL` is listed in settings/`.env.example` but its consumer isn't fully wired in the invite-link construction description.** Settings section + `accept_invite` URL.
   `send_invite_email(invite, raw_token, accept_url)` takes a prebuilt `accept_url`, and `SITE_BASE_URL` is introduced for management-command link building, but the design never states explicitly which component concatenates `SITE_BASE_URL` + `reverse("accounts:accept_invite", ...)`. Concrete fix: state that the management command builds `accept_url = settings.SITE_BASE_URL.rstrip("/") + reverse("accounts:accept_invite", args=[invite.id, raw_token])` and passes it in, so there's one documented owner of absolute-URL assembly.

4. **NIT — login page lucide icon set may be incomplete for the "Create account" affordance.** Templates section.
   The design vendors `mail.svg`, `lock.svg`, `log-in.svg`. The home-page edit adds a "Create account" anchor and the existing hero already uses `user`/`users`/`calendar-check`. If the new signup/login buttons want a distinct "create account" glyph (e.g. `user-plus`), it must be vendored too or the `icon` component renders empty (confirmed behavior in `components/icon/icon.py`). Concrete fix: either reuse an already-vendored name for the Create-account button or add the specific SVG to the vendored list.

---

## Verified Assumptions

- **`requests` is not a dependency.** Confirmed: `requirements.txt` lists only Django, DRF, django-environ, psycopg, whitenoise, argon2-cffi, django-components. The stdlib-`urllib` approach is correct and adds no dependency.
- **Argon2 is the default hasher and `argon2-cffi` is installed.** Confirmed in `requirements.txt` (`argon2-cffi==23.1.0`) and the `settings.py` comment ("PASSWORD_HASHERS left at Django's default (Argon2 first)"). `make_password`/`check_password` for OTP/token hashing is valid and constant-time on verify.
- **`/api/auth/` endpoints are plain CSRF-protected Django views.** Confirmed in `api/auth.py` and `api/urls.py`; the design's rationale for plain `/accounts/` views matches the documented reasoning exactly.
- **`role_required` references `settings.LOGIN_URL`.** Confirmed in `adapters.py` (`redirect_to_login(..., settings.LOGIN_URL)`). `LOGIN_URL` is NOT currently set in `settings.py`, so adding it is correct and makes the existing fallback explicit.
- **`AbstractUser.username` is `unique=True`.** Confirmed via `User(AbstractUser)` in `models.py` with no username override. The IntegrityError race handling in `register_member` branch 1 is therefore valid, and `email` has no DB uniqueness — matching the design's statement.
- **`home.html` current state.** Confirmed exactly: a `btn btn-primary` "Staff portal" anchor to `{% url 'membership:member_list' %}`, a `btn btn-outline` "Sign in" anchor to `/admin/` (icon `user`), and no signup link. The design's NIT-5 edit (repoint Sign in to `accounts:login`, add Create account to `accounts:signup`, leave Staff portal + `/admin/` reachable) is accurate.
- **`icon` component renders empty for unknown names and reads `static/vendor/lucide/<name>.svg`.** Confirmed in `components/icon/icon.py`; the vendored-SVG requirement is real.
- **No existing `can_manage_staff_invites`; RBAC helpers are pure.** Confirmed in `permissions.py`; the new helper matches the pure-function pattern (`_is_authenticated` + role check), single-sourced.
- **`apps/accounts/migrations/0001_initial.py` exists; `apps/accounts/tests/` is a package.** Confirmed (0001 present; `test_session_auth.py`, `test_permissions.py` exist). Adding `0002` without editing `0001` and new `tests/test_*.py` files is consistent with AGENTS.md and the repo layout.
- **CSRF, sessions, messages middleware present.** Confirmed in `settings.py` MIDDLEWARE and TEMPLATES context processors (`messages`), so the design's `{% csrf_token %}`, `django.contrib.messages`, and session `pending_user_id` usage are all supported.
- **`.env.example` convention.** Confirmed: one `# comment` per variable, placed after the PayMongo block; the design's appended `# Email (Resend)` section matches the style.

## Unverified / Wrong Assumptions

- **None blocking.** No claim in the design was found to be wrong against the codebase.
- **`test_session_auth` creates a `MemberProfile` (used to justify not creating a profile at signup).** VERIFIED true — `apps/accounts/tests/test_session_auth.py` does `MemberProfile.objects.create(user=self.user)`. The design's assumption that profile creation stays with enrollment is consistent with the module ownership in `apps/membership/`. The "create a PENDING profile at signup?" question is correctly left open rather than silently decided.
- **Anti-enumeration timing residual.** The design itself flags that hashing-on-real-users vs skipped-work-on-unknowns can leak a timing signal and declares fully constant-time behavior out of scope. This is an acknowledged limitation, not an unverified assumption; acceptable for this pass.
