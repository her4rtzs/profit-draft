# Design — Custom Member Authentication (login, email-OTP signup, Owner staff-invite foundation)

## Overview

This feature adds server-rendered HTML authentication pages for **Members** to the ProFit staff/web surface, plus the backend foundation for an **Owner-initiated staff invite** flow. Public self-signup creates a Member who must verify an emailed 6-digit OTP before the account activates. Staff accounts (Cashier, Personal Trainer) are never self-registered; an Owner creates them via a signed, single-use invite link. Owner remains a bootstrapped superuser.

Everything is **additive**. The existing DRF session-auth endpoints the mobile app depends on (`GET /api/auth/csrf/`, `POST /api/auth/login/`, `POST /api/auth/logout/`) and the `/admin/` login are left untouched. New pages live under `/accounts/` and are plain Django views (not DRF `APIView`) so `CsrfViewMiddleware` protects the anonymous POSTs — the same reasoning already documented in `api/auth.py`.

The stack is locked to the existing one: Django 5.1.4 templates extending `templates/base.html`, Tailwind + daisyUI (build-time compiled, no CDN), HTMX for partial updates, Alpine.js for small client state, the `icon` django-component with vendored Lucide SVGs, Django ORM only, Argon2 password hashing (already the default; `argon2-cffi` installed). No new JS framework, no `requests` dependency — the Resend client uses stdlib `urllib`.

All new code lives in the existing **`apps.accounts`** app, because it owns the `User` model and RBAC. Business logic lives in services and model methods; views stay thin. New tests go under `apps/accounts/tests/`.

---

## Technology stack (locked)

- Backend: Django 5.1.4, plain function-based views, Django ORM.
- Email: a single abstraction with two Django email backends — a custom **Resend HTTP backend** (stdlib `urllib.request`, no new dependency) selected when `RESEND_API_KEY` is set, else Django's **console backend** (and the **locmem backend** under test). Selection is wired through `EMAIL_BACKEND` in settings based on env.
- Hashing: OTP codes and invite tokens are stored as **Django password-hasher hashes** via `django.contrib.auth.hashers.make_password` / `check_password` (Argon2, constant-time verify). This reuses the project's existing hasher config and avoids hand-rolled HMAC.
- Templates: daisyUI classes first; `icon` component for icons; HTMX for the OTP-resend partial; Alpine only for trivial client state (show/hide password). No custom CSS unless daisyUI cannot express it.
- Timezone Asia/Manila, currency PHP (currency not relevant here). Expiry math uses `django.utils.timezone.now()` (UTC-aware) for storage; display is incidental.

---

## Data model

Two new models in `apps/accounts/models.py`. Neither changes the existing `User` model's fields, so the only `User` concern is how `username`/`email`/`is_active` are set at signup (below).

### `EmailOTP`

Holds a single issued one-time code targeting a `User` whose account is not yet verified/active.

| Field | Type | Notes |
|---|---|---|
| `user` | `ForeignKey(User, on_delete=CASCADE, related_name="email_otps")` | The pending member. |
| `code_hash` | `CharField(max_length=128)` | Argon2 hash of the 6-digit code. Plaintext never stored or logged. |
| `purpose` | `CharField(max_length=20, choices)` | `SIGNUP` for this pass. Reserved for future reuse (e.g. password reset). |
| `created_at` | `DateTimeField(default=timezone.now)` | Issue time. Resend cooldown derived from the latest row's `created_at`. |
| `expires_at` | `DateTimeField` | `created_at + 10 minutes`, set in the issuing service. |
| `attempts` | `PositiveSmallIntegerField(default=0)` | Incremented on each wrong verification. Cap = 5. |
| `consumed_at` | `DateTimeField(null=True, blank=True)` | Set when the code is accepted (single-use). |

Model methods (logic lives here, not in the view):
- `is_expired(now)` → `now >= expires_at`.
- `is_consumed()` → `consumed_at is not None`.
- `is_usable(now)` → not expired, not consumed, `attempts < MAX_ATTEMPTS`.
- `MAX_ATTEMPTS = 5`, `TTL = timedelta(minutes=10)`, `RESEND_COOLDOWN = timedelta(seconds=60)` as class constants.

Index: `models.Index(fields=["user", "purpose", "created_at"])` to find the latest active code cheaply. No `unique` constraint on `user` — a user may have multiple historical rows; the service always reads the most recent `SIGNUP` row.

### `StaffInvite`

Holds an Owner-issued invitation for a staff account.

| Field | Type | Notes |
|---|---|---|
| `email` | `EmailField` | Invitee email. |
| `role` | `CharField(max_length=20, choices=Role.choices)` | Fixed by Owner at issue time. Validated to be `CASHIER` or `TRAINER` only (never OWNER/MEMBER). |
| `token_hash` | `CharField(max_length=128)` | Argon2 hash of the raw token embedded in the link. Raw token never stored. |
| `invited_by` | `ForeignKey(User, on_delete=PROTECT, related_name="sent_invites")` | Must be an Owner (enforced in the service). |
| `created_at` | `DateTimeField(default=timezone.now)` | |
| `expires_at` | `DateTimeField` | `created_at + 72 hours` (invite links live longer than OTPs). |
| `used_at` | `DateTimeField(null=True, blank=True)` | Set when the invite is accepted (single-use). |
| `accepted_user` | `ForeignKey(User, null=True, blank=True, on_delete=SET_NULL, related_name="+")` | The user created/activated on accept. |

Model methods: `is_expired(now)`, `is_used()`, `is_usable(now)`, class constants `TTL = timedelta(hours=72)`.

Validation: `clean()` rejects any `role` not in `{Role.CASHIER, Role.TRAINER}`. The service also re-checks (defense in depth) because `clean()` is not called on plain `.create()`.

**Invariant ownership.** The "invitee cannot choose their role" invariant is owned by the **service + model**, not the template: the accept view never reads a role from the request. The "only Owner issues invites" invariant is owned by the **RBAC layer** (`permissions.py` + `adapters.py`), single-sourced — see below.

### User fields at signup

`User` extends `AbstractUser`, so `username` is required and unique while `email` is not unique by default. Decision:
- Signup collects **email + password** (no separate username field in the UI).
- The signup service sets `username = email` and `email = email`. `AbstractUser.username` max_length is 150 and `EmailField` max is 254; emails longer than 150 chars are rejected at validation with a generic "could not create account" message (documented edge case; such addresses are vanishingly rare).
- To prevent duplicate members, the service enforces **case-insensitive email uniqueness** across `User.email` in application code (`User.objects.filter(email__iexact=email)`), returning the generic signup response either way (anti-enumeration — see Security).
- New member is created with `is_active = False` and `role = Role.MEMBER`. It is activated only on successful OTP verification.
- No `MemberProfile` is created at signup time. Rationale: `MemberProfile` is a Membership-module concern created during staff enrollment, and the mobile `test_session_auth` flow creates it explicitly. Creating a profile here would couple accounts to membership and change enrollment semantics. **Assumption flagged:** signup creates the auth User only; profile creation stays with the enrollment flow. If the product wants a profile row at signup, that is a one-line service addition but should be confirmed — called out in Open Questions.

### Email normalization and the login identifier (login == signup, single rule)

Both signup and login must agree on how an email maps to the stored `username`. The rule, owned by `services.py` and shared by the login form:

- **Normalization:** `email_normalized = email.strip().lower()`. A single module-level helper `normalize_email(email)` in `services.py` is the one source of truth; both `register_member` and the login path call it. (Domain-only lowercasing is not used — full lowercasing is simpler and matches how members will type their address; the tradeoff is that two addresses differing only by local-part case collapse to one account, which is acceptable for this product.)
- **Signup** sets `username = email_normalized` and `email = email_normalized`, and the case-insensitive duplicate check (`User.objects.filter(email__iexact=...)`) is consistent with it.
- **Login** collects **email + password**, normalizes the email with the same `normalize_email(...)`, then calls `authenticate(request, username=email_normalized, password=...)`. Because `authenticate` matches `username` exactly (case-sensitive) and signup stored a normalized username, case-insensitive signup and login agree. The login view relies on the invariant `username == normalized email` for self-signup members.
- **Pre-existing / non-member users whose `username != email`** (the bootstrapped Owner superuser; staff whose chosen username is not their email): these cannot log in through `/accounts/login/` by email. **Decision:** `/accounts/login/` is the member entry point and authenticates by email only. Owner and staff log in through **`/admin/`** (Owner) or, once the account's `username` was set to the invited email by the invite-accept flow, through `/accounts/login/` by that email. Staff created by invite always have `username == invited email` (see `accept_invite`), so they *can* use `/accounts/login/`. Only the bootstrapped Owner superuser (username not necessarily an email) is restricted to `/admin/`. This is stated on the login page copy ("Staff and owners sign in via the admin site").

---

## Email abstraction

A single module `apps/accounts/emails.py` plus a custom backend `apps/accounts/email_backends.py`.

### Backend selection (settings)

In `profit/settings.py`, read env (names only; documented in `.env.example`):
- `RESEND_API_KEY` (default `""`)
- `DEFAULT_FROM_EMAIL` (default `"ProFit <onboarding@resend.dev>"` — a safe non-secret default for local/dev)

The selection is factored into a **small pure function** so it is unit-testable without re-importing settings. Put it in `apps/accounts/email_backends.py`:

```python
from django.core.exceptions import ImproperlyConfigured

def select_email_backend(resend_api_key: str, debug: bool) -> str:
    """Return the EMAIL_BACKEND dotted path for the given key presence.

    The console fallback is DEVELOPMENT-ONLY: it writes the full message
    (recipient + OTP code / invite link) to stdout, which Vercel captures as
    function logs. Allowing it when DEBUG=False would leak the OTP and the
    recipient address to production logs, breaking the "never log PII/OTP"
    guarantee. So an unset key in production is a hard misconfiguration.
    """
    if resend_api_key:
        return "apps.accounts.email_backends.ResendEmailBackend"
    if debug:
        return "django.core.mail.backends.console.EmailBackend"
    raise ImproperlyConfigured(
        "RESEND_API_KEY must be set when DEBUG is False; the console email "
        "backend would leak OTP codes and recipient addresses to logs."
    )
```

`settings.py` then does `from apps.accounts.email_backends import select_email_backend` and `EMAIL_BACKEND = select_email_backend(RESEND_API_KEY, DEBUG)`. This resolves Finding 2: the console-to-logs OTP/PII leak can only occur in local dev (`DEBUG=True`), never on Vercel with `DEBUG=False`; a prod deploy without `RESEND_API_KEY` fails fast at settings-import time rather than silently printing codes. The function also gives Finding-7 a direct unit test (assert the dotted path for key-set, key-absent+debug, and the `ImproperlyConfigured` raise for key-absent+not-debug) without fragile settings re-import. Import safety: `email_backends.py` must import only stdlib and `django.core.mail.backends.base` at module top (no models, no `apps.accounts.models`), so importing it during settings evaluation does not trigger app/model loading before the app registry is ready. The service layer and models are imported lazily inside backend methods if ever needed (they are not).

Tests do not need special-casing for `mail.outbox`: Django's test runner forces `locmem` via `EMAIL_BACKEND` override, so `mail.outbox` works regardless of the configured backend. The Resend key is read into a module-level setting `RESEND_API_KEY` so the backend can access it; it is **never logged or echoed**.

### `ResendEmailBackend`

Subclasses `django.core.mail.backends.base.BaseEmailBackend`. `send_messages(email_messages)` iterates messages and POSTs each to `https://api.resend.com/emails` using `urllib.request.Request` with headers `Authorization: Bearer <key>` and `Content-Type: application/json`, body `{"from", "to", "subject", "html"|"text"}`. Returns the count sent.

Error handling for the Resend call:
- Network/`URLError`/timeout (set a short timeout, e.g. 10s): catch, log `WARNING` with **no PII** (log only `event="resend_send_failed"` and HTTP status if available — never the recipient address, subject, or body), and **raise a custom `EmailDeliveryError`** so the caller (service) can decide. It does **not** propagate as a 500.
- Non-2xx HTTP response: same treatment — log status code only, raise `EmailDeliveryError`.
- Missing key at send time: should not happen (backend only selected when key present), but guard and raise `EmailDeliveryError`.

### `emails.py` service functions

- `send_otp_email(user, code)` — builds subject/body (plain text + minimal HTML), calls `django.core.mail.send_mail(..., fail_silently=False)`. The **code is passed in** and placed in the body; the function must never log `code` or `user.email`. It persists nothing (Finding 4: `issue_otp` already stored the row).
- `send_invite_email(invite, raw_token, accept_url)` — builds the accept link, calls `send_mail(..., fail_silently=False)`. Never logs the token or email.

**Exception flow (Finding 4, made internally consistent).** Both functions call `send_mail` with `fail_silently=False`, so whatever the configured backend raises propagates deterministically. `ResendEmailBackend.send_messages` raises the custom `EmailDeliveryError` on any transport/non-2xx failure; with `fail_silently=False` that exception propagates up through `send_mail` to `send_otp_email`/`send_invite_email` and out to the **service caller** (`register_member`, `resend_otp`, `create_staff_invite`/the invite command). `send_otp_email`/`send_invite_email` themselves catch nothing — they are pure send helpers. The single catch site is the OTP/invite service caller (and, for the HTTP paths, the view-service boundary), which converts `EmailDeliveryError` into a user-facing "we couldn't send the email, try resend / try again" — **never a 500**. (The console/locmem backends do not raise, so dev/test paths simply succeed.)

---

## Services (business logic)

New `apps/accounts/services.py`. Views call these; services own transactions and invariants.

### Signup / OTP

- `register_member(email, password) -> RegisterResult`
  - Validate email format and password via `validate_password` (AUTH_PASSWORD_VALIDATORS). On failure raise `ValidationError` (field errors re-rendered — these are *format* failures, not enumeration signals).
  - Normalize the email via `normalize_email(...)`.
  - **Case-insensitive duplicate check** (`User.objects.filter(email__iexact=email_normalized)`). Three branches, all producing the same observable response so an attacker cannot tell them apart:
    1. **No existing user** → create inactive `User(username=email_normalized, email=email_normalized, role=MEMBER, is_active=False)` in `transaction.atomic()`, set password via `set_password`, then `issue_otp(user, purpose=SIGNUP)` (persist row, return raw code) and have the caller send it (see Finding 4 response — the send owner is fixed). Return `RegisterResult(pending_user_id=user.id)`.
       - **Concurrent / duplicate-username race (Finding 1).** `AbstractUser.username` is `unique=True`, so two concurrent signups for the same new email both pass the `iexact` check and then one `User.save()` raises `IntegrityError`. The create/`save` is therefore wrapped in `try/except IntegrityError`; on collision the service does **not** 500 — it re-reads the now-existing row by `username=email_normalized` and **falls through to the generic path** (branch 2 if that row is still inactive → re-issue OTP under cooldown; branch 3 if it is already active → decoy). This keeps the observable response identical to every other branch and preserves anti-enumeration. The `username unique=True` collision is thus a named, handled path, not an implicit 500. (There is still no DB-level `unique` constraint on `User.email`; the login invariant "exactly one member per normalized email, `username == normalized email`" is enforced by this `username`-uniqueness plus the shared normalization. A separate case-insensitive DB constraint on `email` is **not** added this pass because `email` is also used by non-member/legacy rows where `username != email`; the `username` uniqueness is the authoritative guard and is DB-enforced.)
    2. **Existing user that is still inactive/unverified** → treat as a legitimate re-signup: do **not** create a second user, re-issue an OTP to that existing user via `issue_otp` (subject to cooldown — a cooldown just means no new mail this instant, still a generic response). Return `RegisterResult(pending_user_id=existing.id)`.
    3. **Existing user already active** → do nothing (no user created, no mail sent). Return `RegisterResult(pending_user_id=None, decoy=True)`.
  - `RegisterResult` is a small dataclass/namedtuple returned to the view; the raw code never reaches the view. The service never raises on the duplicate/active case — it returns a result the view maps to the identical redirect.
- `issue_otp(user, purpose) -> raw_code`
  - **Single responsibility = PERSIST ONLY (Finding 4).** `issue_otp` enforces the cooldown, generates the code, stores the hashed row, and **returns the raw code**. It does **not** send mail. This removes the earlier ambiguity where `issue_otp`, `register_member`, and `resend_otp` could each trigger a send (risking a double-send).
  - Enforce resend cooldown: if the latest row's `created_at` is within `RESEND_COOLDOWN`, raise `OTPCooldownError`.
  - Generate 6-digit numeric code using `secrets.randbelow(1_000_000)` zero-padded to 6 digits (cryptographically secure; leading zeros preserved — `000000` is a valid code and the verify side's "exactly 6 ASCII digits" rule accepts it with no special-case, per review NIT 6).
  - Store `EmailOTP(code_hash=make_password(code), expires_at=now+TTL, ...)`.
  - Return the raw code to the caller **only** so the caller can hand it to `send_otp_email`. The raw code is never returned to the HTTP layer or logged.
- **Send ownership (Finding 4).** "Issue" and "send" are each invoked **exactly once per OTP**, by the same caller:
  - `register_member` branch 1 does: `code = issue_otp(user, SIGNUP)` then `send_otp_email(user, code)` — one issue, one send.
  - `resend_otp` does: `code = issue_otp(user, SIGNUP)` then `send_otp_email(user, code)` — one issue, one send.
  - `issue_otp` never sends; `send_otp_email` never persists. Only these two callers catch `EmailDeliveryError`. Because the row persists before the send, a failed send leaves a usable-after-resend state and never rolls back the pending user.
- `verify_otp(user, code) -> VerifyResult`
  - **Return a small frozen dataclass, not a bool** (Finding 3), so the view can render the exact per-reason copy from the error-handling table. Shape:
    ```python
    @dataclass(frozen=True)
    class VerifyResult:
        ok: bool
        reason: str  # Literal["ok","bad_code","expired","consumed","capped","no_pending"]
    ```
  - Load the latest `SIGNUP` row for the user. If none → `VerifyResult(False, "no_pending")`.
  - If `row.is_consumed()` → `VerifyResult(False, "consumed")`.
  - If `row.is_expired(now)` → `VerifyResult(False, "expired")`.
  - If `row.attempts >= MAX_ATTEMPTS` → `VerifyResult(False, "capped")`.
  - Otherwise `check_password(code, row.code_hash)`:
    - Match → set `consumed_at=now`; `user.is_active=True`; save both; `VerifyResult(True, "ok")`.
    - No match → `attempts += 1`, save; if the increment reaches `MAX_ATTEMPTS` return `VerifyResult(False, "capped")`, else `VerifyResult(False, "bad_code")`.
  - All in `transaction.atomic()`. The service never raises for an ordinary verify outcome, so the view never 500s on wrong/expired/capped/consumed input.
  - **View mapping (verify view).** The view switches on `result.reason`:
    - `ok` → `login(request, user)` + redirect to `LOGIN_REDIRECT_URL`.
    - `capped` → render "too many attempts, request a new code" (the resend button stays available).
    - `expired`, `consumed`, `bad_code`, `no_pending` → render the single generic "invalid or expired code" copy (collapsed on purpose so a wrong code and an expired/consumed/absent row are indistinguishable to the client).
  - **Logging.** Only `reason == "capped"` emits `INFO event=otp_attempts_exceeded user_id=<id>` (id only, never the code or email). No other reason is logged.
- `resend_otp(user)` — the single caller for a re-issue: `code = issue_otp(user, SIGNUP)` (which enforces the cooldown and raises `OTPCooldownError` if too soon) then `send_otp_email(user, code)` exactly once; it is the place that catches `EmailDeliveryError` for the resend path.

### Invite

- `create_staff_invite(*, owner, email, role) -> (StaffInvite, raw_token)`
  - Assert `owner` passes `can_manage_staff_invites(owner)` (RBAC helper, below). If not, raise `PermissionDenied` — the view/adapter normally gates this first, but the service re-checks (single source still `permissions.py`).
  - Validate `role in {CASHIER, TRAINER}`; else `ValidationError`.
  - Normalize the invitee email with the shared `normalize_email(...)` and store it on `StaffInvite.email`, so the later `accept_invite` username (`invite.email`) matches the signup/login normalization rule.
  - Generate raw token with `secrets.token_urlsafe(32)`; store `token_hash=make_password(raw_token)`, `expires_at=now+TTL`.
  - Return invite + raw token (raw token only used to build the link; never stored/logged).
- `accept_invite(*, raw_token, invite_id, password) -> User`
  - Load invite by id; if not `is_usable(now)` → `InvalidInviteError`.
  - Constant-time `check_password(raw_token, invite.token_hash)`; mismatch → `InvalidInviteError`.
  - Validate password via `validate_password`.
  - **Email source:** the new account's `email`/`username` are read from `invite.email` **only** — never from the accept request. The accept form collects **password + confirm-password only**; it has no email field and no role field. This prevents an invite issued to A from being redeemed into an account for B.
  - **Existing-user branch (defined, not "create or activate"):** compute `username = invite.email` (already normalized at invite time — `create_staff_invite` normalizes). If a `User` with that username already exists, raise `InvalidInviteError` ("this invite link is invalid or expired"): invites are for provisioning *new* staff accounts, so reusing an invite to re-role or reactivate an existing account is refused. Otherwise create `User(username=invite.email, email=invite.email, role=invite.role, is_active=True)`.
  - In `transaction.atomic()`: create the user with the Owner-chosen role (role comes from the **invite**, never the request), set password via `set_password`, mark `invite.used_at=now`, `invite.accepted_user=user`.
  - Return the user (view then logs them in).

Custom exceptions in `services.py`: `EmailDeliveryError`, `OTPCooldownError`, `InvalidInviteError`, plus reuse Django's `ValidationError` / `PermissionDenied`.

---

## RBAC addition (single-sourced)

Add one pure helper to `apps/accounts/permissions.py`:

```python
def can_manage_staff_invites(user) -> bool:
    """Issue staff invites: Owner only."""
    if not _is_authenticated(user):
        return False
    return user.role == Role.OWNER
```

Add a matching DRF permission class and/or reuse `role_required(can_manage_staff_invites)` from `adapters.py` for the Owner-only invite-create view. This keeps policy single-sourced in `permissions.py`; adapters only translate to HTTP. No existing helper changes.

Also set in `settings.py`: `LOGIN_URL = "/accounts/login/"` and `LOGIN_REDIRECT_URL = "/"`. The existing `role_required` adapter already references `settings.LOGIN_URL`; today it falls back to Django's default `/accounts/login/`, so adding the setting makes it explicit and correct for the new pages.

### Admin registration (view-only, no secrets exposed)

Both models are registered on the Django admin (reachable only behind staff/superuser auth) so an Owner can audit pending OTPs and invites, but neither hash is ever shown and neither model is editable through admin:

- Register each with a `ModelAdmin` overriding `has_add_permission` → `False` and `has_change_permission` → `False` (view-only; `has_delete_permission` left to default superuser control). This makes them audit surfaces, not editing surfaces — OTP/invite lifecycle is owned by the services, not admin clicks.
- **`EmailOTP`**: `list_display = ("user", "purpose", "created_at", "expires_at", "consumed_at", "attempts")`. `code_hash` is **excluded** from both list and detail (via `exclude = ("code_hash",)` and a `readonly_fields` set that omits it). `search_fields` must not include the hash.
- **`StaffInvite`**: `list_display = ("email", "role", "created_at", "expires_at", "used_at", "invited_by")`. `token_hash` is **excluded** from list and detail. Showing `email` is an intentional, scoped exception to the "do not expose PII" stance: it is visible only inside the Django admin, which is itself gated to staff/superusers (Owner), and an Owner needs to see which address an invite went to. This exception is limited to admin display; `email` is still never written to application logs.
- No `list_display` or `search_fields` on either model references `code_hash`/`token_hash`, so a hash can never leak through admin.

---

## URLs and views

New app URLconf `apps/accounts/urls.py` with `app_name = "accounts"`, included from `profit/urls.py`:

```python
path("accounts/", include("apps.accounts.urls")),
```

| Path | Name | View | Methods | Auth |
|---|---|---|---|---|
| `/accounts/signup/` | `accounts:signup` | `signup_view` | GET form, POST create | Anonymous |
| `/accounts/verify/` | `accounts:verify` | `verify_view` | GET form, POST verify | Anonymous (pending user id in session) |
| `/accounts/resend/` | `accounts:resend_otp` | `resend_otp_view` | POST (HTMX) | Anonymous (pending user id in session) |
| `/accounts/login/` | `accounts:login` | `login_view` | GET form, POST login | Anonymous |
| `/accounts/logout/` | `accounts:logout` | `logout_view` | POST | Any authenticated |
| `/accounts/invite/accept/<int:invite_id>/<token>/` | `accounts:accept_invite` | `accept_invite_view` | GET form, POST set-password | Anonymous |

Views are **plain function views** in `apps/accounts/views.py`, each wrapped with `@require_http_methods(["GET","POST"])` (or `@require_POST` for resend/logout). CSRF is enforced by middleware; every form template includes `{% csrf_token %}`. Views only parse the form, call a service, map exceptions to messages/redirects, and render. No business logic in views.

#### Pending-signup session state (exact rules)

The OTP is always bound to the **session's** `pending_user_id`; the verify/resend views never look up a user by a request-supplied id or query param, so a user can only verify the account they just signed up for.

- **Single session key:** `request.session["pending_user_id"]` only. There is **no** `pending_otp_until` key — the resend cooldown is derived solely from the latest `EmailOTP.created_at` (one source of truth; see Finding 9 response). Any countdown shown in the UI is a display-only hint computed server-side at render from the DB row.
- **On signup POST** the view inspects the `RegisterResult`:
  - For a real pending user (branches 1 and 2 above), set `pending_user_id = result.pending_user_id`, overwriting any previous value, and redirect to `/accounts/verify/`. Overwriting means a second signup supersedes an abandoned earlier one rather than leaving two live pending ids.
  - For the **decoy** branch (3, email already active), set `request.session["pending_decoy"] = True`, do **not** set `pending_user_id`, and redirect to `/accounts/verify/` with the *same* message. The verify page renders the normal "enter the code we emailed" form. Any code submitted while `pending_decoy` is set is rejected with the same generic "invalid or expired code" message (no code was ever issued), so the decoy path is observably identical to a real pending verification. `pending_decoy` is cleared whenever a real `pending_user_id` is set or on leaving the funnel.
  - This resolves the earlier internal conflict: the "no pending user → redirect to signup" rule applies only when **neither** `pending_user_id` **nor** `pending_decoy` is present (true cold/direct hit); the active-email case carries `pending_decoy` so it stays indistinguishable.
- **On successful `verify_otp`:** the view `pop`s `pending_user_id` from the session *before* calling `login(request, user)`, so a consumed/stale id can never later verify or activate a different account.
- **`verify_view` / `resend_otp_view` with neither `pending_user_id` nor `pending_decoy`** (true direct GET/POST, or after the key was popped): respond with a redirect to `/accounts/signup/` carrying a generic "start signup again" message (for `verify_view` GET) or, for the HTMX `resend_otp_view`, return the `_resend_status.html` partial in its "expired-session, start over" state (HTTP 200). Never 500, never leak whether an account exists. When `pending_decoy` is set (and no real pending id), the verify form still renders normally and any submitted code fails generically; `resend_otp_view` returns the normal "sent" partial without issuing or sending anything.
- **Already-authenticated user** hitting `/accounts/signup/`, `/accounts/verify/`, or `/accounts/resend/`: redirect to `LOGIN_REDIRECT_URL` (they do not belong in the signup funnel).
- **Loaded pending user must still be pending:** `verify_view`/`resend_otp_view` load `User` by `pending_user_id` and treat a user that is already `is_active=True` as a finished funnel — pop the key and redirect to login. This prevents a lingering id from re-driving verification.

On success the verify view calls Django `login(request, user)` and redirects to `LOGIN_REDIRECT_URL`.

#### `/accounts/resend/` response contract (HTMX)

The resend endpoint is HTMX-only and **always returns the `_resend_status.html` partial with HTTP 200** — expected states never raise to a 4xx (a 4xx would make HTMX swap awkwardly and leaks state). The view catches the service exceptions and sets a single context flag `status` that the partial switches on:

| Service outcome | `status` value | Partial renders |
|---|---|---|
| OTP re-issued and sent | `"sent"` | "A new code was sent. Check your email." |
| `OTPCooldownError` | `"cooldown"` | "Please wait a moment before requesting another code." (optionally shows a server-computed seconds hint) |
| `EmailDeliveryError` | `"send_failed"` | "We couldn't send the code right now. Try again shortly." |
| no real pending id but `pending_decoy` set | `"sent"` | identical "sent" copy, nothing issued/sent (anti-enumeration) |
| neither pending id nor decoy (cold hit) | `"expired"` | "Your signup session expired — start again." with a link to `/accounts/signup/` |

The resend view is `@require_POST`; a GET is a 405 before the view runs. CSRF is enforced by middleware; the HTMX form includes `{% csrf_token %}`.

#### Signup POST on `EmailDeliveryError`

If the initial signup's `issue_otp`/`send_otp_email` raises `EmailDeliveryError`, the view still sets `pending_user_id` (the inactive user row persists) and still redirects to `/accounts/verify/`, but adds a `django.contrib.messages` **warning**: "We couldn't send your code — use the Resend button." The verify page shows that message above the code form so the member can retry via the HTMX resend. The signup never 500s on a delivery failure.

### Owner invite-create (minimal path this pass)

Full Owner dashboard UI is **deferred to a follow-up**. This pass ships a minimal but complete create+send path, chosen as **both**:
1. A **management command** `apps/accounts/management/commands/invite_staff.py` — `python manage.py invite_staff --email a@b.com --role CASHIER`. It calls `create_staff_invite` with an Owner resolved by `--owner <username>` (must be Owner) and `send_invite_email`. This gives Owners/admins a scriptable, testable path with no new UI.
2. An **admin action** on `StaffInvite` is **not** added (keeps surface small); instead the management command is the supported entry point and is covered by tests.

**Deferred to follow-up (explicitly):** an Owner-facing HTML page/dashboard to issue invites and list pending/accepted invites. Because **no invite-create HTTP view ships this pass**, the `role_required(can_manage_staff_invites)` *adapter-level* HTTP gating is **not exercised by a test this pass** — it is exercised only when the deferred Owner UI lands. Owner-only enforcement this pass is covered two ways instead: the management command refuses a non-Owner `--owner`, and `create_staff_invite` raises `PermissionDenied` for a non-Owner at the service layer (defense in depth, single-sourced through `permissions.can_manage_staff_invites`). This gap is intentional and called out here so the reviewer does not read it as a missed requirement. The accept-invite page itself (invitee-facing) **is** in scope and built now.

---

## Templates and static assets

New templates under `templates/accounts/`, each extending `base.html` and using daisyUI card/form classes matching `home.html`:
- `templates/accounts/login.html`
- `templates/accounts/signup.html`
- `templates/accounts/verify.html` (includes an HTMX resend button posting to `/accounts/resend/`, swapping a small status partial)
- `templates/accounts/_resend_status.html` (HTMX partial)
- `templates/accounts/accept_invite.html`

New vendored Lucide SVGs under `static/vendor/lucide/` (no CDN): `mail.svg`, `lock.svg`, `log-in.svg`. The `icon` component already path-guards names and renders empty for unknown names, so these must be added for the icons to appear.

Landing page: update `templates/home.html`. Verified current state (review NIT 5): the hero has `<a href="/admin/" class="btn btn-outline">…Sign in</a>` plus a separate `Staff portal` button linking to `{% url 'membership:member_list' %}`, and **no** signup link. Change exactly the Sign-in anchor's `href` from `/admin/` to `{% url 'accounts:login' %}` (the member/no-account entry point), and **add** a new "Create account" anchor pointing at `{% url 'accounts:signup' %}` alongside it. Leave the separate `Staff portal` button and the direct `/admin/` reachability untouched — Owner/staff still sign in via the admin site. This satisfies decision 4 (HTML pages serve as the no-account entry point) without removing admin login.

---

## Settings and env changes

`profit/settings.py`:
- `LOGIN_URL = "/accounts/login/"`, `LOGIN_REDIRECT_URL = "/"`, `LOGOUT_REDIRECT_URL = "/"`.
- Read `RESEND_API_KEY = env("RESEND_API_KEY", default="")` and `DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="ProFit <onboarding@resend.dev>")`.
- Set `EMAIL_BACKEND = select_email_backend(RESEND_API_KEY, DEBUG)` (Resend when key present; console only when `DEBUG=True`; `ImproperlyConfigured` when the key is absent and `DEBUG=False`, so a prod deploy without a key fails fast instead of leaking OTPs to logs). `DEBUG` is already read from env above this line in settings.
- Optional base URL for invite links: `SITE_BASE_URL = env("SITE_BASE_URL", default="http://localhost:8000")`, used to build absolute accept-invite URLs (Vercel has no reliable request host in management commands).

`.env.example` — append a new `# Email (Resend)` section near the other integration keys (after the PayMongo block), following the file's existing one-`# comment`-per-variable convention. Names + non-secret placeholders only; **never a real key**:

```
# Email (Resend). Leave RESEND_API_KEY unset for the offline console backend
# (OTP/invite emails print to the server log). Set it in production for real delivery.
RESEND_API_KEY=
# From address for outbound mail. A verified Resend domain in production.
DEFAULT_FROM_EMAIL=ProFit <onboarding@resend.dev>
# Absolute base URL used to build invite-accept links (management command has no request host).
SITE_BASE_URL=http://localhost:8000
```

Note flagged to the user: `.env.example` currently contains values that look like real secrets (`SECRET_KEY`, `SUPABASE_KEY`). That predates this task and is out of scope here, but it is worth rotating — I will not touch those lines.

---

## Error handling (per operation)

| Operation | Failure | Recoverable? | Caller receives | Logged? |
|---|---|---|---|---|
| Signup form parse | missing/invalid email or weak password | yes | re-rendered form with field errors (generic text, no enumeration) | no |
| Signup duplicate email | email already registered | yes | **generic** "check your email for a code" (same as success) → redirect to verify with a fresh/suppressed state | no (never log email) |
| Signup concurrent/duplicate `username` | `IntegrityError` on `User.save()` (race, Finding 1) | yes | caught, re-read row, fall through to the **generic** path (same as duplicate email) — never a 500 | no |
| OTP send (Resend) | `EmailDeliveryError` | yes | message "couldn't send the code, try Resend"; user row persists inactive | `WARNING event=resend_send_failed`, status only |
| OTP verify wrong code | mismatch | yes (until cap) | "invalid or expired code"; increments `attempts` | no (never log code) |
| OTP verify over cap | `attempts >= 5` | no (must resend) | "too many attempts, request a new code" | `INFO event=otp_attempts_exceeded user_id=...` (id only) |
| OTP expired | now ≥ expires_at | yes (resend) | "invalid or expired code" | no |
| OTP already consumed | reuse | no | "invalid or expired code" | no |
| Resend cooldown | within 60s | yes (wait) | "please wait before requesting another code" | no |
| Login bad creds | wrong user/pass | yes | generic "invalid credentials" | no |
| Login inactive/unverified | `is_active=False` | yes (verify) | generic "invalid credentials" (do not reveal unverified state) | no |
| Invite create not Owner | RBAC fail | no | `PermissionDenied` → 403 (view gated) | `WARNING` id + outcome only |
| Invite create bad role | role not Cashier/Trainer | no | `ValidationError` surfaced to command/admin | no |
| Accept invite bad/expired/used token | `InvalidInviteError` | no | generic "this invite link is invalid or expired" | no (never log token) |
| Accept invite weak password | validators fail | yes | form errors | no |

**Anti-enumeration tradeoff (noted):** signup and login return generic messages so an attacker cannot distinguish "email already registered" / "user exists but unverified" from the normal path. This is reasonable-effort: timing differences (hashing on real users vs. skipped work on unknowns) can still leak signal; fully constant-time behavior is out of scope and documented here as a known limitation.

---

## Input validation (external inputs)

- **email** (signup, login, invite): required; `EmailField`/`validate_email`; normalized via `normalize_email` (strip + lowercase) before use; length ≤ 150 (username constraint) — over-length → generic failure. The **login** form collects `email` + `password`: `email` required and normalized identically to signup; `password` required and non-empty. The login view then calls `authenticate(request, username=<normalized email>, password=<password>)`.
- **password** (signup, accept-invite): required; `AUTH_PASSWORD_VALIDATORS` via `validate_password`; on failure → form errors.
- **code** (verify): required; exactly 6 ASCII digits; non-digit or wrong length → counts as a failed attempt (same as a wrong code) to avoid giving format oracles. `000000` is a valid, non-special-cased code (NIT 6): the rule is purely "6 ASCII digits", so an all-zeros code is accepted and compared like any other.
- **role** (invite create): required; must be `CASHIER` or `TRAINER`; anything else rejected. Never read from the invitee request.
- **token / invite_id** (accept): required path params; token compared via constant-time `check_password`; unusable invite → generic invalid message.
- **next** (login redirect): if used, validate with `url_has_allowed_host_and_scheme` against allowed hosts; otherwise fall back to `LOGIN_REDIRECT_URL`.

---

## Files to add / change

Add:
- `apps/accounts/services.py`
- `apps/accounts/emails.py`
- `apps/accounts/email_backends.py`
- `apps/accounts/forms.py` (Django `Form`s for signup/login/verify/accept — validation only, no persistence)
- `apps/accounts/views.py`
- `apps/accounts/urls.py`
- `apps/accounts/management/__init__.py`
- `apps/accounts/management/commands/__init__.py`
- `apps/accounts/management/commands/invite_staff.py`
- `apps/accounts/migrations/0002_emailotp_staffinvite.py` (new migration; do not edit `0001`)
- `templates/accounts/login.html`, `signup.html`, `verify.html`, `_resend_status.html`, `accept_invite.html`
- `static/vendor/lucide/mail.svg`, `lock.svg`, `log-in.svg`
- Tests: `apps/accounts/tests/test_signup_otp.py`, `test_login.py`, `test_invite.py`, `test_email_backend.py`

Change:
- `apps/accounts/models.py` — add `EmailOTP`, `StaffInvite`.
- `apps/accounts/permissions.py` — add `can_manage_staff_invites`.
- `apps/accounts/adapters.py` — add DRF permission class if a DRF invite endpoint is later added (optional this pass; `role_required` already suffices for the view/command).
- `apps/accounts/admin.py` — register `EmailOTP` and `StaffInvite` **view-only** (see "Admin registration" below for the exact field exposure). Hashes are never exposed; `StaffInvite.email` is shown as a deliberately-scoped exception.
- `profit/settings.py` — `LOGIN_URL`/`LOGIN_REDIRECT_URL`/`LOGOUT_REDIRECT_URL`, email backend selection, `RESEND_API_KEY`, `DEFAULT_FROM_EMAIL`, `SITE_BASE_URL`.
- `profit/urls.py` — include `apps.accounts.urls` under `accounts/`.
- `templates/home.html` — point "Sign in" at `accounts:login`, add "Create account".
- `.env.example` — add the three new names/placeholders.
- `PROJECT-LOG.md` — append a session entry (per AGENTS.md) at implementation time.

Migration: `makemigrations accounts` produces `0002` creating `EmailOTP` and `StaffInvite`. No change to existing `User` table (fields unchanged), so no risky data migration.

---

## Testability

Unit-testable without HTTP: `issue_otp` cooldown, `verify_otp` success/expiry/cap/single-use, `register_member` duplicate handling, `create_staff_invite`/`accept_invite` role fixing and token checks, `ResendEmailBackend` body construction (monkeypatch `urllib.request.urlopen`). Integration-testable via `Client(enforce_csrf_checks=True)`: CSRF on anonymous POSTs, full signup→verify→login redirect, login gating on `is_active`, HTMX resend. Email assertions use `mail.outbox` (locmem under test runner).

### Explicit test list

In `test_signup_otp.py`:
1. signup with valid email+password creates an **inactive** `User` with `role=MEMBER` and issues one `EmailOTP`; `len(mail.outbox) == 1`.
2. correct OTP within the window verifies, sets `is_active=True`, consumes the code, and logs the member in (session authenticated, redirect to `/`).
3. wrong OTP is rejected and increments `attempts` (and does not activate).
4. after 5 failed attempts the code is unusable: `verify_otp` returns `VerifyResult(ok=False, reason="capped")`, the view shows the "too many attempts" copy, and a subsequent correct submit is still rejected as `capped` (distinct from `bad_code`). Also assert `expired`/`consumed`/`bad_code`/`no_pending` all render the single generic "invalid or expired code" copy (reason distinguished in the service return, collapsed in the UI).
5. expired OTP (travel past `expires_at`) is rejected.
6. OTP is single-use: a consumed code cannot be reused.
7. resend respects the 60s cooldown (second immediate resend blocked; allowed after cooldown).
8. the OTP code never appears in logs (capture logging; assert code string absent) and the email address is not logged on a Resend failure path.
9. CSRF enforced: `Client(enforce_csrf_checks=True)` POST to signup/verify/resend without token → 403.
10. Resend send failure surfaces a user-facing error (no 500) and leaves the user able to resend (simulate backend raising `EmailDeliveryError`).

21. **duplicate-email anti-enumeration:** signing up with an email that is already **active** returns the identical redirect-to-verify response and creates **no** second user and sends **no** mail (`len(mail.outbox) == 0` for that POST); signing up with an email that exists but is still **inactive** re-issues to that same user without creating a duplicate.
27. **duplicate-username race (Finding 1):** when the pre-create `iexact` check passes but `User.save()` raises `IntegrityError` (simulate by pre-creating the row or monkeypatching `save` to raise once), `register_member` catches it, re-reads the row, and returns the generic result (no 500, no duplicate user) — asserting the response matches the ordinary duplicate-email path.
22. **decoy verify path:** after a decoy signup (active email), submitting any code on `/accounts/verify/` yields the same generic "invalid or expired code" response as a real wrong code (no state disclosure).
23. **login via email normalization:** a member who signed up as `User@Example.com` can log in with `user@example.com` (both normalize to the same `username`); `authenticate` is called with the normalized email.

In `test_login.py`:
11. login succeeds for a verified (active) member (form collects email+password; email normalized before `authenticate`).
12. login fails generically for an unverified/inactive member (no state disclosure).
13. logout ends the session (POST, CSRF-protected).

In `test_invite.py`:
14. only an Owner can create an invite (`create_staff_invite` with a non-Owner caller raises `PermissionDenied`).
15. accepting a valid invite sets the password and activates a user with the **Owner-chosen** role; invitee cannot change the role (no role field is read from the request/form) and the account email/username come from `invite.email`, not the request.
16. expired invite token rejected (`InvalidInviteError`).
17. used invite token rejected (single-use).
18. wrong/garbage token rejected via constant-time check.
24. **accept-invite into an existing username is refused** (`InvalidInviteError`) — invites provision new accounts only.
25. **management-command surface** (`call_command("invite_staff", ...)`): (a) success with a valid Owner `--owner` + `--role CASHIER` creates an invite and sends one email (`len(mail.outbox) == 1`); (b) a non-Owner `--owner` is refused (command exits non-zero / raises `CommandError`, no invite created); (c) an invalid `--role` (e.g. `OWNER` or `MEMBER`) is rejected.

In `test_email_backend.py`:
19. with `RESEND_API_KEY` set, `ResendEmailBackend` builds the expected request (monkeypatched transport) and does not log the recipient/subject/body.
20. with no key, the console backend path is selected (and `mail.outbox` still works under the test runner).
26. **backend-selection function** `select_email_backend(...)` branches: `select_email_backend("re_live_...", debug=False)` and `(..., debug=True)` both return the `ResendEmailBackend` dotted path; `select_email_backend("", debug=True)` returns the console backend dotted path; `select_email_backend("", debug=False)` raises `ImproperlyConfigured` (prod-without-key fails fast, no console-to-logs OTP leak — Finding 2).

---

## Open questions / flagged assumptions

- **MemberProfile at signup:** this design creates only the auth `User` at signup, leaving `MemberProfile` creation to staff enrollment. If product wants a `PENDING` profile row created on member signup, confirm — it is a small service addition but changes module ownership.
- **Username == email:** emails over 150 chars are rejected. If arbitrary-length emails must be supported, `User.username` would need widening (a `User` migration), which is a larger change than this task warrants.
- **Owner invite UI deferred:** only the management command (create+send) and the invitee-facing accept page ship now. The Owner-facing issue/list dashboard is an explicit follow-up.
- **`.env.example` apparent real secrets:** pre-existing `SECRET_KEY`/`SUPABASE_KEY` values look real; recommend rotation, but left untouched here.

---

## Responses to design review

This revision addresses every finding in `design-review.md`. Summary of how each was handled:

- **Finding 1 (HIGH — login identifier unspecified):** ADDRESSED. Added the "Email normalization and the login identifier" subsection: one shared `normalize_email` helper (strip + lowercase) used by both signup and login; login collects email+password and calls `authenticate(username=<normalized email>, ...)` relying on the `username == normalized email` invariant; a login validation row was added. Decision recorded: `/accounts/login/` is email-only for members; the bootstrapped Owner superuser logs in via `/admin/`; invite-created staff get `username == invited email` so they can use `/accounts/login/`. Login page copy states staff/owners use the admin site.

- **Finding 2 (MEDIUM — `accept_invite` email source undefined):** ADDRESSED. `accept_invite` now reads email from `invite.email` only (never the request); the accept form collects password + confirm only. The "create or activate" ambiguity is replaced with a defined branch: an existing username → `InvalidInviteError`; otherwise create a new user. `create_staff_invite` now normalizes the invitee email so `invite.email` matches the signup/login rule.

- **Finding 3 (MEDIUM — pending-signup session hijack/stale):** ADDRESSED. Added explicit "Pending-signup session state" rules: OTP bound to session `pending_user_id` only (never a request-supplied id); overwrite on new signup; pop on success before `login()`; missing-id → redirect/partial, never 500; authenticated users redirected out of the funnel; a loaded pending user that is already active is treated as a finished funnel.

- **Finding 4 (MEDIUM — resend HTMX response shape):** ADDRESSED. Added the `/accounts/resend/` response contract: always `_resend_status.html` at HTTP 200 with a `status` flag ∈ {sent, cooldown, send_failed, sent(decoy), expired}; expected states never 4xx. Also specified the signup-POST `EmailDeliveryError` path uses `django.contrib.messages` warning and still redirects to verify.

- **Finding 5 (MEDIUM — duplicate-email branch vs generic success):** ADDRESSED. `register_member` now returns a `RegisterResult` with three defined branches (new / existing-inactive / existing-active decoy), and the view wiring (`pending_user_id` vs `pending_decoy`) makes all three produce an identical redirect-to-verify and identical verify behavior. The residual timing signal is still acknowledged in the anti-enumeration tradeoff note.

- **Finding 6 (MEDIUM — admin exposure of hashes/PII):** ADDRESSED. Added the "Admin registration (view-only)" subsection: `has_add_permission`/`has_change_permission` False; explicit `list_display` with non-sensitive fields; `code_hash`/`token_hash` excluded from list and detail; `StaffInvite.email` shown as an intentional, admin-only, Owner-gated exception, never logged.

- **Finding 7 (MEDIUM — missing tests for backend selection, invite command, Owner HTTP gating):** ADDRESSED. Added `select_email_backend(...)` pure function with unit test 26; added management-command tests 25(a–c); and explicitly documented that no invite-create HTTP view ships this pass, so adapter-level HTTP gating is intentionally untested now and Owner-only enforcement is covered at the command + service layers.

- **Finding 8 (NIT — `.env.example` section/style):** ADDRESSED. Specified an appended `# Email (Resend)` section placed after the PayMongo block, matching the one-comment-per-variable convention, with exact placeholder lines.

- **Finding 9 (NIT — unused `pending_otp_until`):** ADDRESSED. Dropped `pending_otp_until` entirely; the resend cooldown is derived solely from the latest `EmailOTP.created_at` (single source of truth). Any UI countdown is a display-only server-computed hint.

### Responses to the second review round (`design-review.md`, 4 MEDIUM + 2 NIT, verdict CHANGES_REQUESTED)

This revision addresses every finding in the current `design-review.md`:

- **Finding 1 (MEDIUM — case-insensitive email uniqueness has no DB constraint; concurrent/duplicate-`username` race unhandled):** ADDRESSED. `register_member` branch 1 now wraps the create/`save` in `try/except IntegrityError`; on the `username unique=True` collision it re-reads the existing row and falls through to the same generic path (inactive→re-issue, active→decoy), so a race produces the identical response and never a 500. Documented that the DB-enforced `username` uniqueness (plus shared normalization) is the authoritative guard for the login invariant, and why a separate case-insensitive `email` DB constraint is not added (legacy/non-member rows have `username != email`). Added error-table row "Signup concurrent/duplicate `username`" and test 27.

- **Finding 2 (MEDIUM — console backend leaks OTP/PII to logs in production):** ADDRESSED. `select_email_backend` now takes `(resend_api_key, debug)`: console is returned only when `DEBUG=True`; with the key absent and `DEBUG=False` it raises `ImproperlyConfigured` so a prod deploy without a key fails fast instead of printing codes/recipients to Vercel logs. Chose option (a) from the review (dev-only console) over documenting an accepted leak, because the leak conflicts with the no-log guarantee. Updated the settings wiring and test 26.

- **Finding 3 (MEDIUM — `verify_otp` cannot express the distinct over-cap/expired/consumed outcomes):** ADDRESSED. `verify_otp` now returns a frozen `VerifyResult(ok, reason)` with reasons `ok|bad_code|expired|consumed|capped|no_pending`. Added the explicit view mapping (success→login; `capped`→"too many attempts"; the rest→single generic "invalid or expired code") and the logging rule (only `capped`→`INFO`, id only). Updated test 4 to assert the `capped` reason distinctly.

- **Finding 4 (MEDIUM — split/ambiguous send responsibility, `EmailDeliveryError` vs `send_mail` inconsistency):** ADDRESSED. Pinned one owner of "send": `issue_otp` PERSISTS ONLY and returns the raw code (never sends); the callers `register_member` and `resend_otp` each call `send_otp_email` exactly once and are the single catch site for `EmailDeliveryError`. `send_otp_email`/`send_invite_email` call `send_mail(..., fail_silently=False)` so the backend's `EmailDeliveryError` propagates deterministically to that single catch site. This removes the double-send ambiguity and makes the exception path internally consistent.

- **Finding 5 (NIT — exact landing-page anchor):** ADDRESSED. Specified the exact current anchor (`<a href="/admin/" …>Sign in</a>`), the precise edit (repoint to `accounts:login`, add a `Create account` link to `accounts:signup`), and that the separate `Staff portal` button and direct `/admin/` reachability stay untouched.

- **Finding 6 (NIT — `000000` validity):** ADDRESSED. Confirmed `secrets.randbelow(1_000_000)` zero-padded yields `000000`–`999999`, that `000000` is a legitimate code, and that the verify input rule ("exactly 6 ASCII digits") accepts it with no special-casing. Noted in both `issue_otp` and the input-validation section.
