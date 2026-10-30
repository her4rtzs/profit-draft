# System Architecture

## Overview

One Django project serves two client surfaces: a staff web portal and a member mobile app. Both talk to the same Django + DRF backend and the same Supabase PostgreSQL database; neither client touches Supabase or PayMongo credentials directly (`Architecture.md` §1, `README.md` lines 3–7).

```
Browser (web/)  ──┐
Django pages    ──┼──►  Django + DRF  ──►  Supabase PostgreSQL (ORM only)
Mobile (Expo)   ──┘         │
                            ├──► PayMongo Checkout Sessions (test mode)
                            └──◄── /webhooks/paymongo/ (signed events)

Supabase pg_cron ──► UPDATE membership_memberprofile (SQL, outside Django)
```

## Components

| Component | Responsibility | Evidence |
| --- | --- | --- |
| `profit/` | Django project: env-driven settings, URL root, WSGI/ASGI entry | `profit/settings.py`, `profit/urls.py`, `profit/wsgi.py` |
| `api/` | DRF viewsets and plain Django session-auth views mounted at `/api/` | `api/urls.py`, `api/auth.py`, `api/staff.py`, `api/member.py`, `api/join.py` |
| `apps/accounts/` | `User` + `Role`, `EmailOTP`, `StaffInvite`, RBAC pure functions, view/DRF adapters, email backends | `apps/accounts/models.py`, `apps/accounts/permissions.py`, `apps/accounts/adapters.py` |
| `apps/membership/` | `MemberProfile`, `Enrollment`, `Attendance`; enroll/renew/check-in services | `apps/membership/models.py`, `apps/membership/services.py` |
| `apps/billing/` | `Subscription`, `Payment`, `WebhookEvent`, `PendingSignup`; Checkout Sessions, webhook receiver | `apps/billing/models.py`, `apps/billing/services.py`, `apps/billing/webhooks.py` |
| `apps/finance/` | `ManualPayment` (desk), `TransactionRecord` stub; monthly summary | `apps/finance/models.py`, `apps/finance/services.py` |
| `apps/announcements/`, `apps/notifications/`, `apps/trainers/` | Announcement lifecycle, stored notifications, trainer assignment and requests | `apps/*/models.py` |
| `web/` | Static staff portal, member portal, PWA shell, public pages; served at the site root | `profit/settings.py` (`WHITENOISE_ROOT`), `web/sw.js` |
| `templates/`, `components/`, `static/` | Django-rendered portal pages, django-components, vendored HTMX/Alpine/Lucide, Tailwind source | `templates/`, `components/button/`, `static/vendor/` |
| `mobile/` | Expo member app skeleton | `mobile/README.md`, `mobile/api/client.js` |
| `supabase/cron/` | Membership-expiry SQL, applied by hand | `supabase/cron/membership_expiry.sql` |

## Data flow

1. **Static portal (browser).** WhiteNoise serves `web/` at `/` (`WHITENOISE_ROOT`, `WHITENOISE_INDEX_FILE`). Pages call the same-origin `/api` through `web/api.js`: every non-GET request first ensures a `csrftoken` cookie (`GET /api/auth/csrf/`) and echoes it in `X-CSRFToken`; all requests use `credentials: "include"`.
2. **Django-templated portal.** `profit/urls.py` routes `/` to `profit.views.home`, plus `accounts/`, `membership/`, `finance/` and `admin/` includes.
3. **Mobile app.** Session + CSRF only: `GET /api/auth/csrf/` → `POST /api/auth/login/` with `X-CSRFToken` → `GET /api/membership/me/` → `GET /api/attendance/` (`mobile/README.md` lines 35–56).
4. **Join / pay.** `api/join.py` and `api/member.py` call `apps/billing/services.py`: `create_join_checkout` (pay-first, no account yet → `PendingSignup` with hashed password) or `create_checkout` (existing member → `PENDING` `Subscription` + `Payment`). PayMongo hosts the session; `billing.services._paymongo_session` posts to the Checkout Sessions API.
5. **Payment confirmation.** PayMongo calls `POST /webhooks/paymongo/` (`profit/urls.py` → `apps.billing.webhooks.paymongo_webhook`). The handler verifies the HMAC-SHA256 signature over the raw body, records the event in `WebhookEvent` (unique `event_id`), then inside one transaction flips the payment via `mark_payment_paid` / `mark_payment_failed` and, on a real pending→paid transition, calls `activate_paid_payment` → `renew_member`. A paid `PendingSignup` is completed by `complete_signup`.
6. **Desk payments.** `finance.services.record_desk_payment` writes `ManualPayment`, renews the membership in the same transaction, and pushes a `Notification`.
7. **Expiry.** `pg_cron` SQL (commented out, applied manually) flips `membership_memberprofile.membership_status` to `EXPIRED` where `expiry_date` is before the Manila date. The app also checks expiry at read time, so a skipped job does not grant access.

## Boundaries

- **Database access** goes through the Django ORM only. The single sanctioned raw-SQL exception is `supabase/cron/membership_expiry.sql` (`AGENTS.md`; the file says so itself).
- **Payment status** is written in exactly one place: the webhook, through `apps/billing/services.py` mutators. Client redirects and confirmation endpoints are not trusted; `confirm_join` asks PayMongo server-side (`_session_is_paid`).
- **Permissions** are decided by pure functions in `apps/accounts/permissions.py` and translated to HTTP by adapters; DRF endpoints declare `CanViewAttendance`, `CanManageEnrollment`, `CanViewFinancials` (`api/staff.py`). Hiding UI is not the control.
- **Trust boundary at the webhook:** `csrf_exempt` + `require_POST`, protected by signature verification; bad signature → 400 with no `WebhookEvent` row.
- **Public surface:** `/` (`profit.views.home`) is unauthenticated and does no database access (`profit/views.py` docstring).
- **Secrets** come from environment variables (`profit/settings.py`); `.env` is git-ignored.

## Invariants

| Invariant | Enforced where | Evidence |
| --- | --- | --- |
| Money is integer centavos, never floats | Model fields and service constants | `PositiveIntegerField` in `apps/billing/models.py`, `apps/finance/models.py`; `PLAN_PRICE_CENTAVOS` in `apps/finance/services.py` |
| Prices come from the server, keyed by plan name | `PLAN_PRICE_CENTAVOS`; unknown plan raises `ValidationError` | `apps/finance/services.py` lines 19–23, `apps/billing/services.py` |
| Payment paid/failed is terminal once set | Mutators no-op on `PAID`/`FAILED` | `apps/billing/services.py` (`mark_payment_paid`, `mark_payment_failed`) |
| Webhook events are idempotent | `WebhookEvent.event_id` unique + `select_for_update` + `IntegrityError` recovery | `apps/billing/models.py`, `apps/billing/webhooks.py` |
| At most one check-in per member per Manila day | Derived `check_in_date` + `UniqueConstraint(member, check_in_date)` | `apps/membership/models.py` |
| Membership activation goes through one service | `enroll_member` / `renew_member` called by staff, webhook and desk-payment paths | `apps/membership/services.py`, `apps/billing/services.py`, `apps/finance/services.py` |
| Time zone is `Asia/Manila` for day boundaries | Settings + `timezone.localdate()` | `profit/settings.py`, `apps/membership/models.py` |
| One-time codes and invite tokens are stored hashed | `EmailOTP.code_hash`, `StaffInvite.token_hash`, `PendingSignup.password_hash` | `apps/accounts/models.py`, `apps/billing/models.py` |
| A Member reads/changes only their own records | Permission helpers compare `member.user_id` with `user.pk` | `apps/accounts/permissions.py` |

Documented but **not verified in code**: "users and members are never deleted, only deactivated" (`Architecture.md` §3) — `User.is_active` exists via `AbstractUser`, but no deletion guard was found in the files read.

## Not yet inspected

- Row Level Security policies in the live Supabase project — Unknown.
- Whether the `pg_cron` job is applied — Unknown (`ROADMAP.md` phase 3 has no record).
- Migration file contents (`apps/**/migrations/`) — listed, not read.
- `apps/accounts/adapters.py` internals and every DRF permission class body — not read in full.
