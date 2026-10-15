# ProFit First-Build Design — Scaffold & Vertical Slice (Revision 3)

> This is Revision 3, responding to the Revision-2 `design-review.md` (verdict `CHANGES_REQUESTED`, 2 HIGH / 4 MEDIUM / 3 NIT). Every finding from that review is resolved inline below; a point-by-point response log appears at the end under **Review response log (Revision 3)**. The Revision-2 response log (answering the earlier 4 HIGH / 8 MEDIUM / 3 NIT round) is retained beneath it for traceability.

## Overview

This document designs the **first build** of ProFit, the gym operations management system for Functional Fitness Gym. The goal of this pass is a runnable, testable Django monorepo scaffold that matches the layout, stack, and rules in `AGENTS.md`, plus a thin vertical slice through each module so the architecture is proven end-to-end without implementing the full feature set. The scaffold must satisfy `python manage.py check` and `python manage.py test` on a developer laptop with **no live Supabase, no live PayMongo, and no network**, while being wired correctly for the Vercel + Supabase production target.

`AGENTS.md` is authoritative. Where it leaves a decision open (marked with TODO comments or "confirm" notes), this design resolves it for the first build and records the reasoning. The stack is **locked** by `AGENTS.md`: Django + Django REST Framework backend deployed serverless on Vercel; Supabase PostgreSQL via the Django ORM; React Native + NativeWind + react-native-reusables + lucide-react-native mobile; Django templates + Tailwind + daisyUI + HTMX + Alpine.js + django-components + Lucide web portal; PayMongo payments; Supabase `pg_cron` scheduled jobs. Nothing here changes that.

**Runtime pin (resolved — HIGH-2).** The target is **Python 3.13** across both local dev and Vercel. The only interpreter available in this workspace is **Python 3.13.14** (verified via `python --version`), and Vercel's current Python runtime supports 3.13, so dev and deploy use the same minor version. The version is pinned in exactly two enforceable places so they cannot drift:

- `vercel.json` → `"functions": { "api/index.py": { "runtime": "python3.13" } }`
- `.python-version` at repo root → `3.13`

Local dev must use a 3.13 virtualenv. We do **not** pin 3.12 anywhere; the earlier draft's 3.12 claim is dropped. Django baseline is **5.1.x** (the single resolved value, not "5.x"); DRF is **3.15.2**. All exact pins are in the `requirements.txt` section below.

## First-build scope

### In scope (this pass)

1. **Backend project scaffold** — `profit/` Django project, env-driven settings with safe offline local-dev fallback, WhiteNoise static serving with a defined build-time `collectstatic`, Supabase-pooler-safe DB flags, `vercel.json`, pinned `requirements.txt`, `.env.example`, `.gitignore`.
2. **`apps/accounts`** — custom `User` model with a `Role` concept (Owner, Cashier, Personal Trainer, Member) and server-side RBAC permission helpers encoding the `AGENTS.md` matrix exactly, usable by **both** Django views and DRF endpoints.
3. **`apps/membership` (Module 1)** — real models (member profile, enrollment, attendance) with business logic in model/service methods; DRF read serializers/viewsets in `api/` for the mobile app with concrete routing; minimal staff web views.
4. **`apps/billing` (Module 2)** — model stubs + placeholder service modules + a **concrete** PayMongo webhook receiver stub that verifies the signature using an **assumed** scheme (pending confirmation against a real PayMongo sample — see HIGH-1 below), is idempotent under races, and is the only writer of payment paid/failed state.
5. **`apps/finance` (Module 3)** — model stubs + placeholder service modules (Owner-only dashboard surface, no reporting logic yet).
6. **`supabase/cron/`** — `pg_cron` membership-expiry SQL stub.
7. **Web portal shell** — base template with build-time-compiled Tailwind/daisyUI (no runtime CDN), one example django-component, one HTMX-driven partial, concretely-specified Lucide icon delivery.
8. **`mobile/`** — React Native skeleton (NativeWind + react-native-reusables + lucide-react-native) with one screen that calls the DRF API, with a specified auth model.
9. **Tests** — unit tests for RBAC permission helpers and webhook idempotency + signature verification. Fresh migrations only.

### Out of scope (deliberately deferred to later passes)

- Real PayMongo payment-intent creation and the full checkout flow (web and mobile). Billing/finance keep stubs this pass. The PayMongo HTTP client (and its `requests`/`httpx` dependency) is deferred to that pass.
- Financial dashboard reporting logic and aggregations (Module 3.1/3.2 beyond model stubs and an access-gated placeholder page).
- Supabase Storage / `django-storages` wiring for PDFs and profile images (env names reserved; integration deferred).
- Member self-service enrollment, push notifications, full mobile navigation and auth UX beyond the single API-backed screen.
- Production deploy automation and the actual applying of `pg_cron` SQL (SQL file is delivered; applying it is a documented manual step).
- Alpine.js interactions beyond what the one example partial needs.

## Repo layout

Created exactly per the `AGENTS.md` "Repo layout" section, with the addition of `api/index.py` as the Vercel entry point (see HIGH-3) and `.python-version` (see HIGH-2):

```
ProFit/
  manage.py
  requirements.txt
  vercel.json
  .python-version
  .env.example
  .gitignore
  profit/
    __init__.py
    settings.py
    urls.py
    wsgi.py
    asgi.py
  apps/
    __init__.py
    accounts/      # users, roles, RBAC permissions
    membership/    # Module 1: enrollment, attendance, member profiles
    billing/       # Module 2: subscriptions, PayMongo, webhook receiver
    finance/       # Module 3: transaction history + reports
  api/
    index.py       # Vercel WSGI entry: exposes `app`
    urls.py        # DRF DefaultRouter, included at /api/
    serializers.py # mobile read serializers
    views.py       # mobile read viewsets
  templates/       # page templates (staff web portal)
  components/       # django-components
  static/
    src/           # Tailwind source (input.css, tailwind.config.js, package.json)
    dist/          # compiled CSS (build output)
    vendor/        # vendored HTMX, Alpine, and Lucide SVG set (no CDN)
  staticfiles/     # STATIC_ROOT (collectstatic output; build artifact, bundled for Vercel)
  mobile/          # React Native member app
  supabase/
    cron/          # pg_cron SQL definitions
  docs/
```

**Decision — `apps/` as a package.** `AGENTS.md` lists apps under `apps/`. We make `apps/` a Python package with an `apps/__init__.py` and set each app's `AppConfig.name` to the dotted path (e.g. `apps.membership`) and `label` to the short name (e.g. `membership`). `INSTALLED_APPS` references the full dotted paths. This keeps migration/table names clean and matches the documented layout. The `profit` project package stays at root alongside `manage.py`.

**Decision — `api/` holds both the DRF app and the Vercel entry.** `AGENTS.md` lists top-level `api/` for "DRF serializers and viewsets." We keep serializers/views/urls there and additionally place the Vercel entry file `api/index.py` there, because Vercel's `@vercel/python` builder discovers handler files under the project and importing the WSGI app from a single, obvious location keeps the deploy surface explicit. `api/` is a plain module directory (it is *not* a Django app and is not in `INSTALLED_APPS`); its DRF viewsets import models from the `apps.*` packages.

## Settings & environment configuration

`profit/settings.py` reads every value from the environment, with local-dev fallbacks chosen so the project runs offline. We use **`django-environ`** (`environ.Env`) rather than hand-rolled `os.getenv` parsing, because it gives typed reads (`env.bool`, `env.int`), a single `.env` loader, and `env.db_url()` which parses `DATABASE_URL` into Django's `DATABASES` dict. It reads a local `.env` file when present (via `environ.Env.read_env`) and does nothing when absent, which is the offline-friendly behavior we want.

Environment variables consumed (names exactly as in `AGENTS.md`):

| Variable | Type | Required in prod | Local-dev fallback | Purpose |
|---|---|---|---|---|
| `SECRET_KEY` | str | yes | a fixed insecure dev literal (`"dev-insecure-key-not-for-production"`) | Django crypto signing |
| `DEBUG` | bool | no (defaults off) | `True` | debug mode |
| `ALLOWED_HOSTS` | csv | yes when `DEBUG=False` | `["localhost", "127.0.0.1"]` | host header allow-list |
| `DATABASE_URL` | url | yes | **unset → SQLite** at `BASE_DIR/db.sqlite3` (via explicit `default=`) | primary DB connection; **in production must target the Supabase transaction-mode pooler endpoint (pooler host, port `6543`)**, not the direct `5432` connection or the session pooler (see HIGH-2 below) |
| `SUPABASE_URL` | str | yes (Storage later) | `""` | Supabase project URL |
| `SUPABASE_KEY` | str | yes (Storage later) | `""` | Supabase API key |
| `PAYMONGO_SECRET_KEY` | str | yes (billing later) | `""` | PayMongo API auth |
| `PAYMONGO_WEBHOOK_SECRET` | str | yes (webhook) | `"whsec_test_dummy"` | webhook signature verification |

**Decision — DB fallback with an explicit default (resolved — MEDIUM-6).** `env.db_url` raises `ImproperlyConfigured` when the variable is unset and no `default` is supplied, so the fallback must be passed explicitly. The exact call is:

```python
DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
    )
}
```

When `DATABASE_URL` is set (local Postgres or the Supabase pooler) it is parsed normally; when unset the SQLite URL default is used so `check`/`test`/`runserver` work with zero external services. `django-environ` is pinned to **`django-environ==0.11.2`**, a release whose `Env.db_url(var, default=...)` accepts the `default` keyword and parses the `sqlite://` scheme into Django's `ENGINE`/`NAME` form.

**Decision — Supabase pooler safety: connection endpoint AND ORM flags (resolved — HIGH-2).** `AGENTS.md` requires the Supabase pooler **in transaction mode**, which is two separate obligations, not one.

*The connection endpoint (the half the prior revision omitted).* In production, `DATABASE_URL` must point at the **transaction-mode pooler endpoint** — the Supabase connection-pooling host on port **`6543`** — which is distinct from the **session** pooler and from the **direct** database connection on port **`5432`**. Pointing `DATABASE_URL` at the direct `5432` endpoint would satisfy the ORM flags below yet still violate the constraint and forfeit the serverless connection pooling the constraint exists to provide (each Vercel invocation is a short-lived process that must borrow a pooled connection, not open a direct one). This is documented in `.env.example` with an inline comment next to `DATABASE_URL` that spells out pooler-vs-direct and names port `6543`. As a guardrail, settings adds a soft check: when `DEBUG=False` and the parsed `DATABASES["default"]["PORT"]` is `5432` (direct) rather than `6543`, log a WARNING at startup that the configured database endpoint is the direct connection, not the transaction-mode pooler. The check logs only the port number — never host, user, or credentials — and warns rather than hard-fails so a deliberate non-Supabase Postgres target is still possible.

*The ORM flags (verified correct in the prior revision, retained).* After building `DATABASES["default"]` we set, unconditionally:
- `DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True`
- `DATABASES["default"]["CONN_MAX_AGE"] = 0`

Transaction mode multiplexes server connections per transaction, so server-side cursors (which outlive a single transaction) are unsafe, and a reused `CONN_MAX_AGE > 0` connection would not survive across stateless invocations. Applying both unconditionally (even for SQLite, where they are harmless) means there is no environment-dependent branch that could pass locally and fail in production. Together, the endpoint requirement plus these two flags are the complete "pooler in transaction mode" obligation.

**Static files (WhiteNoise) with a defined build step (resolved — HIGH-4).** `STATIC_URL = "static/"`, `STATIC_ROOT = BASE_DIR / "staticfiles"`, `STATICFILES_DIRS = [BASE_DIR / "static" / "dist", BASE_DIR / "static" / "vendor"]`. WhiteNoise is inserted in `MIDDLEWARE` immediately after `SecurityMiddleware`.

The manifest-storage requirement is the key fix: `CompressedManifestStaticFilesStorage` needs `collectstatic` output (including `staticfiles.json`) present on disk at request time, and Vercel's filesystem is read-only at runtime with no automatic `collectstatic`. We therefore make the build produce and bundle `STATIC_ROOT` explicitly. The Vercel build command (declared in `vercel.json`, see next section) is:

```
npm --prefix static/src install && npm --prefix static/src run build \
  && python manage.py collectstatic --noinput
```

and `staticfiles/` (STATIC_ROOT) plus `static/dist/` and `static/vendor/` are included in the deployed function bundle via `vercel.json` `functions.includeFiles`. This guarantees the hashed assets and the manifest exist read-only at request time, so WhiteNoise never 500s on a manifest lookup. We keep `CompressedManifestStaticFilesStorage` (cache-busting hashed names are worth it) now that the build step and bundling are specified; the no-manifest `CompressedStaticFilesStorage` alternative is explicitly rejected because the build-and-bundle approach is reliable and gives long-cache immutable assets.

**Security defaults.** `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_HSTS_SECONDS`, and `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` are enabled when `DEBUG` is `False` (HTTPS is mandatory per `AGENTS.md`) and relaxed when `DEBUG` is `True` so local HTTP dev works. `PASSWORD_HASHERS` is left at the Django default (Argon2 first) and we add `argon2-cffi` to `requirements.txt` so the preferred hasher is available — this resolves the `AGENTS.md` "confirm `PASSWORD_HASHERS`" note.

**Locale.** `TIME_ZONE = "Asia/Manila"`, `USE_TZ = True`, `LANGUAGE_CODE = "en-us"`. Currency is PHP; monetary amounts for payments are stored and transmitted as **integer centavos** (never floats). `USE_TZ=True` means datetimes are stored in UTC and rendered in Asia/Manila; attendance/enrollment date logic that must reflect "a gym day" uses `django.utils.timezone.localdate()` so day boundaries follow Manila, not UTC.

**Logging.** A `LOGGING` config with a console handler. A short module docstring and a code comment restate the rule: **never log PII (names, contact details) or payment details** (amounts, PayMongo IDs, card/wallet data). The webhook logger logs only the event id and a status enum, never the payload body.

**App config & DRF auth (resolved — MEDIUM-8).** `AUTH_USER_MODEL = "accounts.User"`. For the first slice we use **`SessionAuthentication` only** in `REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES`, and `DEFAULT_PERMISSION_CLASSES = ["rest_framework.permissions.IsAuthenticated"]` so endpoints are closed by default. We drop `TokenAuthentication` this pass because it requires `rest_framework.authtoken` in `INSTALLED_APPS`, a migration, and a token-issuance endpoint — none of which are in first-build scope, and shipping it half-wired would be dead configuration. The mobile screen (see mobile section) therefore authenticates with a **session cookie obtained from Django's standard login view**, which proves the end-to-end read path without introducing an unbuilt token flow. Adding `authtoken` + `obtain_auth_token` is noted as the first task of the mobile-auth pass.

## `vercel.json`, `requirements.txt`, `.env.example`

**`vercel.json` (resolved — HIGH-3, HIGH-4).** One serving model only: the `@vercel/python` runtime imports a WSGI callable named **`app`** from **`api/index.py`**. There is **no gunicorn** — `@vercel/python` invokes the WSGI app directly inside the serverless function; there is no long-lived process to manage. `api/index.py` is three lines:

```python
# api/index.py
from profit.wsgi import application as app  # Vercel imports `app`
```

`vercel.json` specifies: the Python runtime pin (`functions."api/index.py".runtime = "python3.13"`), the build command (Tailwind compile + `collectstatic`, see HIGH-4 above), `functions."api/index.py".includeFiles` listing `staticfiles/**`, `static/dist/**`, `static/vendor/**`, `templates/**`, and `components/**` so templates and collected static are in the bundle, and a `rewrites` rule sending `"/(.*)"` to `/api/index`. All traffic (web views, DRF endpoints under `/api/`, and the webhook under `/webhooks/paymongo/`) flows through this one function and Django's URLconf routes internally.

**`requirements.txt` — concrete `==` pins (resolved — MEDIUM-7, NIT-3):**

```
Django==5.1.4
djangorestframework==3.15.2
django-environ==0.11.2
psycopg[binary]==3.2.3
whitenoise==6.8.2
argon2-cffi==23.1.0
django-components==0.100
```

Every dependency is a single exact version — no open ranges, no "current stable at build time." `gunicorn` is **removed** (not used by `@vercel/python`). `requests` is **removed** this pass (the PayMongo HTTP client that needs it is out of scope); it will be added and pinned in the billing-implementation pass. `django-components==0.100` is a single hard pin with **no drift escape hatch** (resolved — NIT-1). Its setup has three points the settings section wires up: `django_components` in `INSTALLED_APPS`, the `django_components.template_loader.Loader` added to `TEMPLATES.OPTIONS.loaders`, and a `COMPONENTS = {"dirs": [BASE_DIR / "components"]}` setting. These three were not verifiable against that exact version's source in this workspace, so the implementation pass must confirm them against the `django-components==0.100` docs/source and adjust only the wiring (not the pin) if the API shape differs for that version. **Backlog note (not inline permission to drift):** moving to a newer `django-components` is a separate, deliberate task that must re-verify these three setup points against the new version — it is not an open-ended "any newer compatible set."

**`.env.example`** lists the eight variable **names only** with empty or clearly-dummy right-hand sides and inline comments — no real secrets. `.env` itself is git-ignored. The `DATABASE_URL` line carries a comment (resolved — HIGH-2) distinguishing the two Supabase URLs: *production* must use the **transaction-mode pooler** host on port **`6543`**, while the direct connection (`5432`) and the session pooler are explicitly not what this deployment uses; a developer may instead leave `DATABASE_URL` unset for the offline SQLite fallback or point it at a local Postgres.

## `apps/accounts` — users, roles, RBAC

**Custom user model.** `User(AbstractUser)` with an added `role` field: `role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)`. `Role` is a `models.TextChoices` with `OWNER`, `CASHIER`, `TRAINER`, `MEMBER`. We extend `AbstractUser` (keeping username/password/email) rather than swapping to email-login this pass, because it is the lowest-risk custom-user path and `AGENTS.md` does not mandate email login. `AUTH_USER_MODEL` is set before the first migration so the custom user is baked into the initial migration (fresh migrations only — no swap later).

**Decision — role on the user vs. separate profile.** A single `role` enum on `User` is chosen over Django Groups or a separate role table because the role set is small, fixed, and documented in `AGENTS.md`, and because the permission matrix is area-based rather than object-permission-based. Member-specific data (membership status, etc.) lives on the `membership.MemberProfile` linked one-to-one to `User`, keeping auth concerns in `accounts` and gym-domain data in `membership`.

**RBAC permission helpers (the core of this app).** A single source of truth encodes the matrix so both layers share identical logic. The helper set and semantics are revised to match `AGENTS.md` exactly (resolved — MEDIUM-1, MEDIUM-2):

```python
# apps/accounts/permissions.py  (pure functions; no request/DRF imports)

def can_view_financials(user) -> bool:
    # Owner only.

def can_initiate_payment(user, member=None) -> bool:
    # Intent creation only, NOT status recording:
    # Owner/Cashier for anyone; Member for self (member == user's profile).
    # Status transitions (paid/failed) are webhook-only and are NOT gated here.

def can_manage_enrollment(user) -> bool:
    # Owner, Cashier.

def can_view_attendance(user, member=None) -> bool:
    # Owner/Cashier/Trainer for anyone; Member for own records only.

def can_edit_own_profile(user, target_user) -> bool:
    # All roles: self only. Returns (target_user == user).
```

These are pure functions over `(user, optional target)` returning `bool`, with no framework coupling, which makes them trivially unit-testable and reusable. They encode the matrix exactly:

| Area | Owner | Cashier | Trainer | Member |
|---|---|---|---|---|
| Financial Dashboard / reports | Yes | No | No | No |
| Record payments | Yes | Yes | No | Own only |
| Membership enrollment | Yes | Yes | No | No |
| Attendance records | Yes | Yes | Yes | View own |
| Own profile | Yes | Yes | Yes | Yes |

**Resolving matrix ambiguities (aligned to AGENTS.md, not expanded).**

- **"Record payments → Member: Own only" is modeled as `can_initiate_payment` (resolved — MEDIUM-1).** The capability is *initiating a payment intent*, never writing payment status. The single-writer invariant stands: only the webhook sets `PAID`/`FAILED`, and that transition is **not** gated by any RBAC helper. Owner/Cashier may initiate for any member; a Member may initiate only for their own profile. **Scope caveat — this row is policy-level only this pass.** Because real payment-intent creation is out of scope, `can_initiate_payment` is **defined and unit-tested but has no live caller, view, or endpoint**. Concretely, of the five matrix rows, "Record payments" is the one row that ships this pass at the **policy-definition + unit-test level only, with zero live enforcement surface** — there is no gated view or endpoint that calls it, because billing is stubbed. The other four rows each have a live enforced surface this pass (financials dashboard view, enrollment views, attendance views/endpoints, profile edit). This is a deliberate, called-out gap, not an oversight, and it does not expand or contract what `AGENTS.md` grants. **Explicit first task of the billing-implementation pass:** wire `can_initiate_payment` into the payment-intent-creation view/DRF endpoint so the row gains a live enforcement surface and does not ship permanently unenforced. Stating this here also prevents a future caller from mistaking the helper for a status-writing permission.
- **"Own profile" is self-only for every role (resolved — MEDIUM-2).** The earlier "+ staff for others" clause is **removed**; `can_edit_own_profile(user, target)` returns `target == user` for all roles, matching the `AGENTS.md` matrix cell, which grants no cross-user staff capability. If staff-administers-other-profiles is later needed, it must be raised as an explicit `AGENTS.md` addition naming the exact roles — it is not smuggled in here.
- **"Attendance → Member: View own"** means read-only access to the member's own attendance; Members cannot create attendance records. Only Owner/Cashier/Trainer create attendance. This refines undefined detail without exceeding the matrix.

**Two thin adapters over the shared helpers** (so the same rule is enforced on both surfaces without duplication):
- Django view layer: a `role_required(checker)` decorator / mixin that calls the helper and raises `PermissionDenied` (403) for authenticated-but-unauthorized users and redirects unauthenticated users to `LOGIN_URL`.
- DRF layer: `BasePermission` subclasses (e.g. `CanViewFinancials`, `CanManageEnrollment`, `CanViewAttendance`) whose `has_permission`/`has_object_permission` delegate to the same pure helpers.

Enforcement responsibility: the **helpers own the policy**; the adapters own only the HTTP translation (403 vs redirect vs DRF 403 JSON). This single enforcement point is why the invariant "a Cashier can never see financials" is owned by `permissions.py`, not scattered across views.

**Error / edge behavior for RBAC.**
- Unauthenticated request to a protected web view → redirect to `LOGIN_URL` (302). Protected DRF endpoint → `401` (not authenticated) via DRF default. Recoverable (log in); not fatal; not logged (expected flow).
- Authenticated but wrong role → web `403` (Django `PermissionDenied` → 403 page); DRF `403` JSON `{"detail": "..."}`. Recoverable from the caller's side (log in as the right role); not fatal; logged at WARNING with the user id and the permission name only (never PII).
- Null/anonymous user passed to a helper → returns `False` (helpers treat missing/anonymous users as unauthorized rather than raising). Asserted by test.

## `apps/membership` (Module 1) — real vertical slice

**Models (ORM only, no raw SQL):**
- `MemberProfile` — `OneToOneField(User)`, plus gym fields: `membership_status` (TextChoices: `ACTIVE`, `EXPIRED`, `PENDING`), `date_joined`, `expiry_date` (nullable). Business methods `is_active_on(date)` and `mark_expired()`.
- `Enrollment` — `ForeignKey(MemberProfile)`, `start_date`, `end_date`, `created_by` (`ForeignKey(User)`), `created_at`. Method `activate()` sets the member's status/expiry. Enrollment is the record of a membership period.
- `Attendance` — `ForeignKey(MemberProfile)`, `check_in_at` (datetime), `check_in_date` (`DateField`), `recorded_by` (`ForeignKey(User)`). Unique constraint on `(member, check_in_date)` so a member has at most one attendance row per Manila day. The day is derived via `timezone.localdate(check_in_at)` and materialized into the `check_in_date` column (SQLite has no functional-index support, so the derived date is a stored column that carries the `UniqueConstraint`). **`check_in_date` is populated in `Attendance.save()` (resolved — MEDIUM-4)**, not only in the service: `save()` sets `self.check_in_date = timezone.localdate(self.check_in_at)` (defaulting `check_in_at` to `timezone.now()` if unset) before calling `super().save()`. Owning the derivation in the model means the `(member, check_in_date)` invariant holds for **every** caller — the service, the Django admin, tests, and any future code — not just the one service function, so no path can insert a row with a null or mismatched date that bypasses the constraint.

**Business logic placement.** Enrollment activation, expiry transitions, and attendance de-duplication live in **model methods and a `services.py`** (`enroll_member(...)`, `record_attendance(...)`), never in views or serializers, per `AGENTS.md`. Views/serializers call services.

**DRF (mobile reads) in `api/` — concrete routing (resolved — MEDIUM-3, MEDIUM-4).** `api/serializers.py` and `api/views.py` expose **read-only** viewsets for the member app; `api/urls.py` wires them with a `DefaultRouter` included at `/api/` from `profit/urls.py`:

```python
# api/urls.py
router = DefaultRouter()
router.register("membership", MemberProfileViewSet, basename="membership")
router.register("attendance", MyAttendanceViewSet, basename="attendance")
urlpatterns = router.urls

# profit/urls.py
path("api/", include("api.urls"))
```

- `MemberProfileViewSet` (ReadOnly) exposes a single custom action **`@action(detail=False, methods=["get"], url_path="me")`** resolving to `GET /api/membership/me/`. It returns the authenticated user's own `MemberProfile` as a single serialized object (not a list). The no-profile case is defined: if the authenticated user has no `MemberProfile` (e.g. a staff user, or a member whose profile was not created yet) → **`404`** with body `{"detail": "No member profile."}`. We deliberately use `404` (not `403`) for the no-profile case because it is "there is no such resource for you," and staff users simply have no member profile. The list/retrieve-by-pk default routes are not used for this viewset (only the `me` action is registered as the member-facing read).
- `MyAttendanceViewSet` (ReadOnly) resolves to `GET /api/attendance/`. Its `get_queryset()` filters strictly to `request.user`'s own `MemberProfile`'s attendance; a user with no profile gets an **empty list** (`200 []`), which is correct for a collection endpoint. The `CanViewAttendance` DRF permission is applied so object-level reads of another member's data are impossible.

The one live mobile integration (`MembershipScreen`) calls **both** `GET /api/membership/me/` and `GET /api/attendance/` — this is specified, not an unresolved "or." Writes via the API are out of scope this pass.

**Staff web views.** Minimal, server-rendered: a member list and a member detail page under `apps/membership/views.py`, each guarded by `role_required(can_manage_enrollment)` / `role_required(can_view_attendance)`. These render templates from `templates/` and demonstrate the component + HTMX pattern (below).

**Validation (membership inputs).**
- Enrollment `start_date`/`end_date`: both required (type `date`); `end_date > start_date` enforced in the service, raising `ValidationError` on failure (surfaced as a form error on web, `400` on API if ever exposed). On failure the service makes no DB write (atomic).
- Attendance check-in: `member` required and must reference an existing `MemberProfile`; `check_in_at` optional (defaults to `timezone.now()`). `record_attendance(member, check_in_at=None)` computes `the_date = timezone.localdate(check_in_at or timezone.now())` — the same derivation `Attendance.save()` uses — and attempts the insert inside `transaction.atomic()`. A duplicate same-day check-in is caught by the DB unique constraint; on `IntegrityError` the service **re-queries by `(member, check_in_date=the_date)`** (not by `check_in_at`) and returns that existing row idempotently rather than raising. Keying the recovery off the derived date, not the raw timestamp, is what makes a second tap later the same Manila day — whose `check_in_at` differs but whose `check_in_date` is identical — resolve to the original row. Repeated taps are therefore safe and return the first row.

## `apps/billing` (Module 2) & `apps/finance` (Module 3)

Both are created as full Django apps with migrations, but only **model stubs + placeholder services** this pass — no real payment creation, no reporting math.

**`apps/billing` models (stubs):**
- `Subscription` — `ForeignKey(MemberProfile)`, `amount_centavos` (`PositiveIntegerField`), `status` (TextChoices: `PENDING`, `ACTIVE`, `EXPIRED`), timestamps.
- `Payment` — `ForeignKey(Subscription)`, `amount_centavos`, `status` (TextChoices: `PENDING`, `PAID`, `FAILED`), `paymongo_payment_id` (unique, indexed), `created_at`, `updated_at`. Amounts are integer centavos.
- `WebhookEvent` — the idempotency ledger: `event_id` (unique), `received_at`, `status` (TextChoices: `PROCESSED`, `UNKNOWN_PAYMENT`, `IGNORED`). The `status` column is what makes the race-safe ordering below possible. **No `signature_valid` field** and **no `DEFERRED` status** (resolved — MEDIUM-3, NIT-3): a row is only ever written for an event whose signature already passed, so a persisted "signature invalid" flag would never be `False`; and every ledger state now has a concrete producer (see the status map below). The three statuses are: `PROCESSED` (a payment transition was applied), `UNKNOWN_PAYMENT` (signature valid, event parsed, but no matching `Payment` yet — reprocessable), and `IGNORED` (signature valid but the event type is not one we act on — terminal).

**`apps/billing/services.py` (placeholders):** `create_payment_intent(...)` is defined with a signature and docstring but raises `NotImplementedError` this pass (PayMongo API call deferred). The paid/failed **mutators** `mark_payment_paid(payment)` / `mark_payment_failed(payment)` **are** implemented (they flip `Payment.status` and set `updated_at`) because the webhook needs them; they are the only functions that write those statuses.

**PayMongo webhook receiver (concrete stub — the one place payment state changes).** A single Django view `apps/billing/webhooks.py::paymongo_webhook` (CSRF-exempt, POST-only, mounted under `/webhooks/paymongo/`). Contract, with signature verification for an **assumed** scheme pending real-sample confirmation (HIGH-1), race-safe idempotency (MEDIUM-5), an explicit event-type map (MEDIUM-2), persistence only after a valid signature (MEDIUM-3), and clear unknown-payment handling (NIT-1):

1. **Signature verification — assumed scheme, pending confirmation (resolved — HIGH-1).** Read the **raw** request body (`bytes`) and the `Paymongo-Signature` header. Under the **assumed** scheme the header has the form `t=<unix_ts>,te=<hex>,li=<hex>`, the signed message is **`f"{t}.{raw_body.decode()}"`** — the timestamp, a literal dot, then the raw body (not the raw body alone) — and the comparison signature is HMAC-SHA256 keyed by `PAYMONGO_WEBHOOK_SECRET`, selected `te` in test/dev mode and `li` in live mode (mode derived from whether the configured key is a test or live key). Verification uses `hmac.compare_digest` (constant-time). All of this lives in one pure helper:

   ```python
   # verify_signature(raw_body: bytes, header: str, secret: str, *, mode: str) -> bool
   #   ASSUMED scheme — pending confirmation against a real PayMongo sample (HIGH-1).
   #   header: "t=<unix_ts>,te=<hex>,li=<hex>"
   #   signed_payload = f"{t}.{raw_body.decode()}"
   #   expected = hmac_sha256_hex(secret, signed_payload)
   #   return compare_digest(expected, te if mode=="test" else li)
   ```

   **Confirmation status (HIGH-1).** This workspace contains no PayMongo SDK, vendored doc, or captured event, and this authoring pass has no network access, so the header name/casing, the field names (`t`/`te`/`li`), the delimiter, and the signed-message construction are **assumed, not verified**. Isolating the entire scheme in `verify_signature` means confirming it later touches exactly one function and its test fixture. **Blocking pre-go-live task (tracked, must complete before any real billing traffic):** confirm the scheme against the current PayMongo webhook documentation, record the authoritative doc reference in `docs/`, capture one **real** test-mode event (header + body, secret value redacted) as a fixture, and update `verify_signature` and its tests to assert against that recorded sample. Until that task is done, treat the verifier as structurally correct but contractually unconfirmed; the structure (raw-body read, constant-time compare, single trusted channel, never trust the client redirect) is verified sound regardless of the field details.

   On mismatch or malformed/missing header → return `400`, write **no** `WebhookEvent` row, do nothing else, and log at WARNING only the event id if the body was parseable enough to extract it (never the body or any payload field). **Never** trust the client redirect; this is the only trusted channel. Failure is recoverable (PayMongo retries) and not fatal to the process.

2. **Idempotency separates "seen" from "applied" (resolved — MEDIUM-5, MEDIUM-3).** A `WebhookEvent` row is created **only after the signature passes** — a bad-signature event is never persisted (resolved — MEDIUM-3: no partial/`signature_valid=False` row is ever written, which is why the model carries no `signature_valid` field). After a valid signature, in a single `transaction.atomic()` block we `select_for_update`/`get_or_create` the `WebhookEvent` by `event_id`:
   - If an existing row has `status in {PROCESSED, IGNORED}` → return `200` immediately, do **not** re-apply (true duplicate; both are terminal states).
   - If the row is new, or exists with `status == UNKNOWN_PAYMENT` → continue to step 3 (reprocessing of a not-yet-applied event is allowed, so a retry can land once the Payment exists).

   The ledger row is therefore **not** permanently closed on a transition until one actually succeeds, which fixes the race where a webhook arriving before its `Payment` row existed would otherwise be recorded as handled forever.

3. **Event-type map and state transition (atomic with the ledger write; resolved — MEDIUM-2).** The event type is resolved first and drives the branch explicitly — there is no implicit "per the event type":
   - `payment.paid` → look up `Payment` by `paymongo_payment_id`; if found, call `mark_payment_paid(payment)`, set `WebhookEvent.status = PROCESSED`, commit (the webhook is the sole writer of paid/failed); if not found, set `WebhookEvent.status = UNKNOWN_PAYMENT`, commit (see step 4 — a later retry after the Payment exists reprocesses correctly).
   - `payment.failed` → same lookup; if found, `mark_payment_failed(payment)` + `PROCESSED`; if not found, `UNKNOWN_PAYMENT`.
   - **Any other or unrecognized event type** (e.g. `source.chargeable`, refunds, anything we do not act on) → set `WebhookEvent.status = IGNORED`, return `200`, apply **no** payment transition. `IGNORED` is terminal: the event id is recorded so a redelivery short-circuits in step 2 and is never reprocessed.

   The `get_or_create`/`select_for_update`, the event-type branch, and any mutation share one atomic block, so there is no window where the ledger says "done" but the payment is untouched.

4. **Responses & logging (resolved — NIT-1).**
   - Valid signature + successful transition, or true duplicate (`PROCESSED`/`IGNORED`) → `200`.
   - Unknown payment reference → **`200`** (so PayMongo stops retrying forever for a payment we may legitimately never have), ledger row marked `UNKNOWN_PAYMENT`, log the event id with outcome `UNKNOWN_PAYMENT`; the response body does not reveal whether the payment exists.
   - Unrecognized event type → **`200`**, ledger row marked `IGNORED`, log the event id with outcome `IGNORED`.
   - Bad/missing signature or unparseable body → `400`, no state change, **no `WebhookEvent` row at all**.
   - Logs record only event id + outcome enum — never amounts, payer identity, or payload body.

**Decision — HMAC-SHA256 over `timestamp + "." + raw_body` (assumed; resolved — HIGH-1).** The verifier is encapsulated in the single `verify_signature` helper above and is **functional for the assumed format**, with the explicit caveat that the format itself is unconfirmed against a real PayMongo sample this pass (see the confirmation status in step 1). It is unit-tested with a self-generated `(secret, timestamp, body)` triple producing a known signature, a tampered-body negative case, and an assertion on the signed-message shape — but those tests share the implementation's assumptions and therefore prove internal consistency, **not** conformance to PayMongo. A test against a recorded real sample is the blocking pre-go-live task above; the design does **not** claim the external contract is resolved.

**`apps/finance` models (stubs):**
- `TransactionRecord` — read-model stub: `ForeignKey(Payment)`, `amount_centavos`, `recorded_at`. Reporting aggregation is deferred.
- `apps/finance/services.py` placeholder `monthly_summary(...)` raising `NotImplementedError`.
- One Owner-only placeholder web view `financial_dashboard` guarded by `role_required(can_view_financials)` that renders an empty dashboard shell — proving the access gate works even though there is no data yet.

## `supabase/cron/` — membership expiry

A single SQL file `supabase/cron/membership_expiry.sql` containing a commented `pg_cron` stub that schedules a daily job (Asia/Manila-aware) to flip `membership_memberprofile.membership_status` to `EXPIRED` where `expiry_date < current_date`. The file header documents that **this SQL is not managed by Django migrations**, bypasses the ORM by design (the one documented exception in `AGENTS.md`), and must be applied manually against Supabase. Table/column names in the SQL match the ORM-generated names so it stays in sync; a comment warns that renaming the model requires updating this file.

## Web portal shell

**Build-time Tailwind + daisyUI (no runtime CDN).** `static/src/` holds `package.json`, `tailwind.config.js`, and `input.css` (`@tailwind base/components/utilities` with the daisyUI plugin). The documented build command (`npm --prefix static/src run build`, i.e. the Tailwind CLI) compiles to `static/dist/app.css`, which `collectstatic` gathers into `STATIC_ROOT` and WhiteNoise serves (see HIGH-4). `templates/base.html` links the compiled stylesheet via `{% static %}` only — no `cdn.tailwindcss.com`.

**One django-component.** `components/button/` (a `Button` component with `button.py` + `button.html` using daisyUI `btn` classes). `django-components` is in `INSTALLED_APPS`, its template loader is added to `TEMPLATES.OPTIONS.loaders`, and `COMPONENTS = {"dirs": [BASE_DIR / "components"]}` registers the directory (per the pinned `django-components==0.100` setup). The member-list template uses this component to prove the pattern.

**One HTMX partial.** The member-list page includes a search box with `hx-get` pointing at a Django view that returns a **partial template** (`templates/membership/_member_rows.html`) swapped into the results container. Alpine.js is loaded for a small dropdown toggle in the base nav only. HTMX and Alpine are **vendored** into `static/vendor/` (not CDN), consistent with the no-runtime-CDN rule.

**Lucide icons — concrete delivery (resolved — NIT-2).** Icons are delivered as **inline SVG via a django-component icon wrapper**: a vendored subset of the Lucide SVG set lives in `static/vendor/lucide/<name>.svg`, and a `{% component "icon" name="user" %}` component reads the named SVG at render time and inlines it into the page. No runtime `<script>` from a CDN, no client-side Lucide JS. This keeps icon delivery build-time/static and matches the web-UI rules.

## `mobile/` — React Native skeleton

A minimal Expo/React Native app under `mobile/` configured with **NativeWind** (Tailwind for RN, compiled via its Metro/Babel plugin — build-time, consistent with the no-CDN rule), **react-native-reusables** components, and **lucide-react-native** icons. One screen, `MembershipScreen`, performs `fetch` calls against **both** `GET /api/membership/me/` and `GET /api/attendance/` and renders the member's status + attendance using a react-native-reusables card and a lucide icon.

**Auth (resolved — MEDIUM-8; CSRF/cookie-jar caveat NIT-2).** Because the backend uses `SessionAuthentication` only this pass, the screen authenticates with a **session cookie**: a tiny login step posts credentials to Django's login endpoint and the device's cookie jar carries the session on subsequent `fetch` calls (`credentials: "include"`). This proves the end-to-end authenticated read path without a token flow. Two caveats are called out so they are not a surprise later (NIT-2): (1) the two API calls this slice makes are **GET**, which DRF's `SessionAuthentication` does **not** CSRF-protect, so the read path works as described; (2) DRF's `SessionAuthentication` **does** enforce CSRF on unsafe methods, and React Native's `fetch` cookie-jar behavior differs across iOS and Android — so the login `POST` itself must either hit a view that supplies/accepts the CSRF token (fetch the `csrftoken` cookie first and echo it in the `X-CSRFToken` header) or be routed through a CSRF-exempt login endpoint created for the device. Both the CSRF fragility and the cross-platform cookie-jar quirks are removed by the planned **token-auth upgrade** (`rest_framework.authtoken` + `obtain_auth_token`), which is the first task of the mobile-auth pass and the point at which any API writes are added. The API base URL is read from an RN env config (not hard-coded) with a localhost dev default. No business logic lives in the mobile app; it only renders API responses.

## Testing strategy

Fresh migrations only (initial migrations generated against the custom user model and the new apps; nothing to edit since this is the first build).

**Unit tests (fast, no network, SQLite):**
1. `apps/accounts/tests/test_permissions.py` — exhaustively asserts the matrix: for each helper, a user of each role (and the self/other distinction for `can_initiate_payment`, `can_view_attendance`, and `can_edit_own_profile`) returns the exact expected boolean. Table-driven, so adding a role/area is one line. Explicitly asserts `can_edit_own_profile` is self-only for every role (no staff-edits-others), `can_initiate_payment` is intent-only, and anonymous/`None` user → `False`. This is the authoritative RBAC regression guard, and it encodes only what `AGENTS.md` grants.
2. `apps/billing/tests/test_webhook.py` — covers the revised webhook contract:
   - valid signature + new event → `200`, payment transitions, `WebhookEvent.status == PROCESSED`;
   - valid signature + **duplicate** `PROCESSED` event id → `200`, mutator **not** called again (asserted via a spy/mock on `mark_payment_paid` and a `WebhookEvent` count);
   - valid signature + event for a **not-yet-existing** payment → `200`, `WebhookEvent.status == UNKNOWN_PAYMENT`, then a **retry after the Payment is created** → payment transitions and status becomes `PROCESSED` (proves the race fix);
   - valid signature + **unrecognized event type** → `200`, `WebhookEvent.status == IGNORED`, no payment transition, and a redelivery of the same event id short-circuits as a terminal duplicate (guards MEDIUM-2 and the IGNORED producer, NIT-3);
   - **invalid** signature → `400`, no state change, **no `WebhookEvent` row written at all** (guards MEDIUM-3);
   - `verify_signature` unit tests: a self-generated `(secret, timestamp, body)` triple with the matching expected signature passes; a tampered body fails; a malformed header fails; the signed message is asserted to be `"{t}.{body}"`. **These tests share the implementation's assumptions (HIGH-1) and therefore prove internal consistency only, not conformance to PayMongo.** When the blocking pre-go-live task captures a real test-mode event, a test asserting `verify_signature` against that **recorded real sample** is added — that is the test that actually guards the external contract, and until it exists the webhook's signature conformance is explicitly unconfirmed.

**Integration-testable (noted, lighter this pass):** DRF viewset access control via `APIClient` — a member reads only their own records; `GET /api/membership/me/` returns `404 {"detail": "No member profile."}` for a user without a profile; `GET /api/attendance/` returns `200 []` for the same; a member cannot read another member's attendance. Web view access gates via Django test client asserting 302-to-login (anon) and 403 (wrong role).

**Testability note.** Because policy lives in pure functions and the webhook's trust steps (signature, idempotency, mutation) are separable, both high-risk areas (auth and payments) are unit-testable without external services — satisfying the `AGENTS.md` rule to add/update tests for any billing/auth/permissions change. Running `python manage.py check` and `python manage.py test` offline (SQLite, no network) on a Python 3.13 venv is the first-build acceptance gate.

## Invariants (ownership summary)

- **Only the webhook sets paid/failed** — owned by `apps/billing/webhooks.py` + `services.mark_payment_paid/failed`; `Payment.status` is never flipped to PAID/FAILED anywhere else, and **no RBAC helper gates that transition**. Enforced by the single-writer design + the duplicate/race webhook tests.
- **`can_initiate_payment` governs intent creation only** — owned by `apps/accounts/permissions.py`; it never writes payment status and has no live caller this pass.
- **Payment amounts are integer centavos** — owned by the model field type (`PositiveIntegerField`), never floats.
- **RBAC policy is single-sourced and matches AGENTS.md exactly** — owned by `apps/accounts/permissions.py`; views and DRF only translate to HTTP; no capability beyond the matrix (no staff-edits-others). **Live-enforcement caveat (MEDIUM-1):** four of the five matrix rows have a live enforced surface this pass; the "Record payments" row (`can_initiate_payment`) is defined and unit-tested but has **no live caller** until the billing pass wires it in. The *policy* matches AGENTS.md exactly; the *enforcement surface* for that one row arrives with billing.
- **No raw SQL in app code** — owned by every app via the ORM; the sole exception is `supabase/cron/*.sql`, documented as such.
- **No PII/payment data in logs** — owned by the logging config and the webhook logger; asserted by code review and the webhook test checking logged fields.
- **Day boundaries follow Asia/Manila** — owned by services using `timezone.localdate()`, materialized into `Attendance.check_in_date` for the unique constraint.
- **Static assets exist at request time** — owned by the Vercel build (`collectstatic`) + `includeFiles` bundling; WhiteNoise manifest storage depends on it.
- **One runtime version** — Python 3.13, pinned in `vercel.json` and `.python-version`; dev matches deploy.

## Session log reminder

Per `AGENTS.md`, implementation sessions must append an entry to `PROJECT-LOG.md` (append-only, no secrets/PII/payment details). This design does not write that entry; the implementing step does.

---

## Review response log (Revision 3)

Response to every finding in the Revision-2 `design-review.json` / `design-review.md` (2 HIGH / 4 MEDIUM / 3 NIT). Status is one of **Addressed**, **Backlogged**, or **Justified-ignore**.

- **HIGH-1 — Signature scheme asserted as "documented" but unverified against any PayMongo source.** *Addressed (by reframing, not by false verification).* No PayMongo SDK/doc/fixture exists in this workspace and this pass has no network access, so I did **not** verify the scheme. Per the finding's own fix path for the unverifiable case, all wording claiming "PayMongo's documented/actual scheme (resolved)" is changed to "**assumed** scheme, pending confirmation against a real PayMongo sample." Scope item 4, the webhook step 1, and the HMAC decision block now carry an explicit confirmation-status note and a **blocking pre-go-live task**: confirm the scheme against current PayMongo docs, record the reference in `docs/`, capture a secret-redacted real test-mode event as a fixture, and add a test asserting `verify_signature` against that recorded sample. The self-generated-triple tests are explicitly described as proving internal consistency only, not conformance.
- **HIGH-2 — Transaction-mode pooler endpoint/port never specified (only the ORM flags were).** *Addressed.* The settings section now states production `DATABASE_URL` must target the Supabase **transaction-mode pooler** host on port **`6543`** (distinct from the session pooler and the direct `5432`), explains why direct `5432` would satisfy the flags yet violate the constraint, and adds a soft startup WARNING when `DEBUG=False` and the parsed port is `5432`. `.env.example` gets an inline pooler-vs-direct comment on `DATABASE_URL`. The two ORM flags are retained and now framed as the second half of the obligation.
- **MEDIUM-1 — "Record payments" row has no live enforcement surface this pass.** *Addressed.* The RBAC section now states plainly that of the five matrix rows, "Record payments" (`can_initiate_payment`) ships at **policy-definition + unit-test level only, with zero live enforcement surface** until billing wires it into the intent-creation view/endpoint, which is named as the explicit first task of the billing pass. The Invariants summary carries the same caveat so the "matches AGENTS.md exactly" claim no longer implies live enforcement for that row.
- **MEDIUM-2 — Webhook event-type → transition mapping unspecified.** *Addressed.* Step 3 now gives the exact map: `payment.paid` → `mark_payment_paid`; `payment.failed` → `mark_payment_failed`; any other/unrecognized type → `WebhookEvent.status = IGNORED`, return `200`, no transition. `IGNORED` is terminal (redelivery short-circuits).
- **MEDIUM-3 — Signature-failure persistence contradicts the "no row" wording and the `signature_valid` field.** *Addressed.* Chosen behavior (the review's recommended option): on signature failure write **no** `WebhookEvent` row at all, and the `signature_valid` field is **dropped** from the model. Step 1, step 2, step 4, the model description, and the webhook test all now agree: a row exists only for an event whose signature already passed.
- **MEDIUM-4 — `Attendance.check_in_date` population and idempotent-recovery query underspecified.** *Addressed.* `check_in_date` is now populated in `Attendance.save()` (= `timezone.localdate(check_in_at)`), so the `(member, check_in_date)` invariant holds for every caller, not just the service. `record_attendance` computes the same date and, on `IntegrityError`, re-queries by `(member, check_in_date)` — not by `check_in_at` — to return the existing row.
- **NIT-1 — `django-components==0.100` pin hedged with a drift escape hatch.** *Addressed.* The "newer compatible set" hedge is removed; a single hard pin stands, the three setup points are to be verified against that exact version during implementation, and any version move is moved to an explicit backlog note.
- **NIT-2 — RN session-cookie auth omits CSRF/cookie-jar caveats.** *Addressed.* The mobile Auth section now notes the reads are GET (CSRF-exempt), that `SessionAuthentication` enforces CSRF on unsafe methods and RN cookie-jar behavior varies by platform, how the login POST handles CSRF, and that the planned token-auth upgrade removes this fragility for writes.
- **NIT-3 — `DEFERRED`/`IGNORED` statuses declared but never produced.** *Addressed.* `DEFERRED` is **removed**. `IGNORED` is given a concrete producer (unrecognized event types, MEDIUM-2) and is exercised by a test. The `WebhookEvent.status` enum is now exactly `PROCESSED`, `UNKNOWN_PAYMENT`, `IGNORED` — every value has a producer.

## Review response log (Revision 2)

Response to every finding in the earlier (Revision-1) review. Retained for traceability. Status is one of **Addressed**, **Backlogged**, or **Justified-ignore**.

- **HIGH-1 — Webhook signature scheme guessed.** *Addressed.* Signature verification now specifies PayMongo's real scheme: `Paymongo-Signature` header `t=,te=,li=`, signed message `f"{t}.{raw_body}"` (not raw body alone), HMAC-SHA256 keyed by `PAYMONGO_WEBHOOK_SECRET`, `hmac.compare_digest`, mode-selected `te`/`li`. Encapsulated in one pure `verify_signature(raw_body, header, secret, *, mode)` helper with explicit tests, including a test asserting the signed message shape. The stub is functional for this format.
- **HIGH-2 — Python version pin unverified/conflicting.** *Addressed.* Target is Python **3.13**; verified the only local interpreter is 3.13.14. Pinned in two enforceable places (`vercel.json` runtime `python3.13` and `.python-version` = `3.13`); dev must match deploy. The 3.12 claim is removed.
- **HIGH-3 — Vercel vs gunicorn contradiction.** *Addressed.* One model only: `@vercel/python` imports `app` from `api/index.py` (`from profit.wsgi import application as app`); `rewrites` send `/(.*)` to it. `gunicorn` removed from requirements. Exact file and symbol named.
- **HIGH-4 — WhiteNoise manifest / no collectstatic.** *Addressed.* The Vercel build now runs the Tailwind compile **and** `python manage.py collectstatic --noinput`, and `vercel.json` `functions.includeFiles` bundles `staticfiles/**` (STATIC_ROOT) plus `static/dist` and `static/vendor`, so the manifest and hashed assets exist read-only at request time. `CompressedManifestStaticFilesStorage` retained; no-manifest alternative explicitly rejected with reasoning.
- **MEDIUM-1 — "Record payments → Member" vs single-writer / out-of-scope.** *Addressed.* Renamed to `can_initiate_payment(user, member)` (intent creation only; Owner/Cashier anyone, Member self). Status transitions remain webhook-only and ungated. Noted as defined/tested with no live caller this pass.
- **MEDIUM-2 — `can_edit_own_profile` "+ staff for others" overreach.** *Addressed.* Clause dropped; helper returns `target == user` for all roles, matching the matrix. Any future staff-admin capability must be an explicit AGENTS.md addition.
- **MEDIUM-3 — DRF paths inconsistent / routing unspecified.** *Addressed.* `DefaultRouter` in `api/urls.py` included at `/api/` with concrete basenames; `MembershipScreen` calls **both** `/api/membership/me/` and `/api/attendance/` (the "or" is removed).
- **MEDIUM-4 — `me` semantics / no-profile case.** *Addressed.* `GET /api/membership/me/` is an `@action(detail=False)` returning a single object; no-profile → `404 {"detail": "No member profile."}` (staff users included, by design); `/api/attendance/` returns `200 []` for a profile-less user.
- **MEDIUM-5 — Idempotency ledger marked processed before transition; race loses update.** *Addressed.* `WebhookEvent.status` now distinguishes `PROCESSED`/`DEFERRED`/`UNKNOWN_PAYMENT`; only a successful transition sets `PROCESSED`; non-`PROCESSED` events are reprocessable; lookup+mutation+ledger write share one `transaction.atomic()` with `select_for_update`. A retry-after-payment-exists test guards the race.
- **MEDIUM-6 — SQLite fallback relies on unverified `db_url` behavior.** *Addressed.* Specified `env.db_url("DATABASE_URL", default=f"sqlite:///{BASE_DIR/'db.sqlite3'}")` and pinned `django-environ==0.11.2`, which supports the `default` kwarg.
- **MEDIUM-7 — requirements claim pins but list names.** *Addressed.* Concrete `==` pins given for every dependency; Django resolved to `5.1.4`; `django-components==0.100` with its required settings/loader setup documented.
- **MEDIUM-8 — TokenAuthentication without authtoken/issuance; mobile token source unspecified.** *Addressed.* Dropped `TokenAuthentication` for `SessionAuthentication` only this pass; mobile authenticates via session cookie from Django's login view (`credentials: "include"`). The "proves end-to-end" claim is adjusted accordingly; token auth noted as the planned upgrade.
- **NIT-1 — "404-equivalent handled as a logged 200" wording.** *Addressed.* Restated: unknown payment → return `200` (stop retries), ledger `UNKNOWN_PAYMENT`, log event id with outcome `UNKNOWN_PAYMENT`, do not reveal existence.
- **NIT-2 — Lucide web icon delivery vague.** *Addressed.* Inline SVG via a `{% component "icon" name="..." %}` wrapper reading a vendored Lucide SVG set in `static/vendor/lucide/`.
- **NIT-3 — `requests` unused this pass.** *Addressed.* Removed from first-build requirements; deferred (and will be pinned) to the PayMongo-client pass.
