# System Architecture

## Overview

One Django project serves one web portal for staff and members. It talks to the same Django + DRF backend and the same Supabase PostgreSQL database; the browser never touches Supabase credentials directly (`Architecture.md` §1, `README.md` lines 3–7).

```
Browser (web/)  ──┐
Django pages    ──┼──►  Django + DRF  ──►  Supabase PostgreSQL (ORM only)
                            ├──► cash recorded by Owner/Cashier
                            └──◄── GCash claim submitted by member, reviewed by staff

Supabase pg_cron ──► UPDATE membership_memberprofile (SQL, outside Django)
```

## Components

| Component | Responsibility | Evidence |
| --- | --- | --- |
| `profit/` | Django project: env-driven settings, URL root, WSGI/ASGI entry | `profit/settings.py`, `profit/urls.py`, `profit/wsgi.py` |
| `api/` | DRF viewsets and plain Django session-auth views mounted at `/api/` | `api/urls.py`, `api/auth.py`, `api/staff.py`, `api/member.py`, `api/join.py` |
| `apps/accounts/` | `User` + `Role`, `EmailOTP`, `StaffInvite`, RBAC pure functions, view/DRF adapters, email backends | `apps/accounts/models.py`, `apps/accounts/permissions.py`, `apps/accounts/adapters.py` |
| `apps/membership/` | `MemberProfile`, `Enrollment`, `Attendance`; enroll/renew/check-in services | `apps/membership/models.py`, `apps/membership/services.py` |
| `apps/billing/` | `Subscription`, `Payment`, `WebhookEvent`, `PendingSignup` history (read-only) plus `PaymentClaim` and its review services | `apps/billing/models.py`, `apps/billing/services.py`, `api/claims.py`, `api/staff_claims.py` |
| `apps/finance/` | `ManualPayment` (desk), `TransactionRecord` stub; monthly summary | `apps/finance/models.py`, `apps/finance/services.py` |
| `apps/announcements/`, `apps/notifications/`, `apps/trainers/` | Announcement lifecycle, stored notifications, trainer assignment and requests | `apps/*/models.py` |
| `web/` | Static staff portal, member portal, PWA shell, public pages; served at the site root | `profit/settings.py` (`WHITENOISE_ROOT`), `web/sw.js` |
| `templates/`, `components/`, `static/` | Django-rendered portal pages, django-components, vendored HTMX/Alpine/Lucide, Tailwind source | `templates/`, `components/button/`, `static/vendor/` |
| `supabase/cron/` | Membership-expiry SQL, applied by hand | `supabase/cron/membership_expiry.sql` |

## Data flow

1. **Static portal (browser).** WhiteNoise serves `web/` at `/` (`WHITENOISE_ROOT`, `WHITENOISE_INDEX_FILE`). Pages call the same-origin `/api` through `web/api.js`: every non-GET request first ensures a `csrftoken` cookie (`GET /api/auth/csrf/`) and echoes it in `X-CSRFToken`; all requests use `credentials: "include"`.
2. **Django-templated portal.** `profit/urls.py` routes `/` to `profit.views.home`, plus `accounts/`, `membership/`, `finance/` and `admin/` includes.
3. **Sign-up and trial.** `api/join.py` calls `membership.services.register_trial_member`: an active `MEMBER` login with status `TRIAL` and `trial_ends_at` seven days out. No payment is taken at sign-up and no account is held pending payment.
4. **Membership payments.** A member submits a GCash claim (reference + Drive screenshot link) through `POST /api/member/claims/`; staff list and approve/reject it through `/api/staff/claims/`. Approval is one transaction: mark `approved` with reviewer and time, call `enroll_member`, set the expiry. Rejection changes nothing. Cash is recorded by staff through `record_desk_payment`. Old online `Payment` rows are read-only history.
5. **Desk payments.** `finance.services.record_desk_payment` writes `ManualPayment`, renews the membership in the same transaction, and pushes a `Notification`.
6. **Expiry.** `pg_cron` SQL (commented out, applied manually) flips `membership_memberprofile.membership_status` to `EXPIRED` where `expiry_date` is before the Manila date. The app also checks expiry at read time, so a skipped job does not grant access.

## Boundaries

- **Database access** goes through the Django ORM only. The single sanctioned raw-SQL exception is `supabase/cron/membership_expiry.sql` (`AGENTS.md`; the file says so itself).
- **Payment status on old rows is read-only.** The retired gateway's mutators remain only as history helpers; client-supplied amounts and statuses are never trusted. Claims are written only by the submit and review services.
- **Permissions** are decided by pure functions in `apps/accounts/permissions.py` and translated to HTTP by adapters; DRF endpoints declare `CanViewAttendance`, `CanManageEnrollment`, `CanViewFinancials` (`api/staff.py`). Hiding UI is not the control.
- **Claim proof links** are checked by scheme (`https`) and host (`drive.google.com` or `docs.google.com`) and stored as text; the server never opens or fetches them.
- **Public surface:** `/` (`profit.views.home`) is unauthenticated and does no database access (`profit/views.py` docstring).
- **Secrets** come from environment variables (`profit/settings.py`); `.env` is git-ignored.

## Invariants

| Invariant | Enforced where | Evidence |
| --- | --- | --- |
| Money is integer centavos, never floats | Model fields and service constants | `PositiveIntegerField` in `apps/billing/models.py`, `apps/finance/models.py`; `PLAN_PRICE_CENTAVOS` in `apps/finance/services.py` |
| Prices come from the server, keyed by plan name | `PLAN_PRICE_CENTAVOS`; unknown plan raises `ValidationError` | `apps/finance/services.py` lines 19–23, `apps/billing/services.py` |
| Old online payment status is terminal once set | Legacy mutators no-op on `PAID`/`FAILED` | `apps/billing/services.py` (`mark_payment_paid`, `mark_payment_failed`) |
| A GCash reference is unique while a claim is live | DB constraint on desk rows plus service checks across both tables | `apps/finance/models.py`, `apps/finance/services.py`, `api/claims.py` |
| At most one check-in per member per Manila day | Derived `check_in_date` + `UniqueConstraint(member, check_in_date)` | `apps/membership/models.py` |
| Membership activation goes through one service | `enroll_member` / `renew_member` called by staff, claim approval and desk-payment paths | `apps/membership/services.py`, `api/staff_claims.py`, `apps/finance/services.py` |
| Approving a claim twice does not enroll twice | Status guard + locked claim row inside one transaction | `api/staff_claims.py` |
| Time zone is `Asia/Manila` for day boundaries | Settings + `timezone.localdate()` | `profit/settings.py`, `apps/membership/models.py` |
| One-time codes and invite tokens are stored hashed | `EmailOTP.code_hash`, `StaffInvite.token_hash`, `PendingSignup.password_hash` | `apps/accounts/models.py`, `apps/billing/models.py` |
| A Member reads/changes only their own records | Permission helpers compare `member.user_id` with `user.pk` | `apps/accounts/permissions.py` |

Documented but **not verified in code**: "users and members are never deleted, only deactivated" (`Architecture.md` §3) — `User.is_active` exists via `AbstractUser`, but no deletion guard was found in the files read.

## Log backfill (facts stated in PROJECT-LOG.md, cited by entry date)

- Anonymous login/CSRF endpoints were deliberately implemented as **plain Django views**, not DRF APIViews, so `CsrfViewMiddleware` actually checks the login POST (`Client(enforce_csrf_checks=True)`: 403 without token, 200 with). (`PROJECT-LOG.md`, 2026-10-07 21:46.)
- The retired gateway's webhook used a raw-byte HMAC signature; its module, route and `PAYMONGO_WEBHOOK_SECRET` setting are now deleted. Old rows and their references remain in the database as history. (`PROJECT-LOG.md`, 2026-10-07 21:30; `docs/05 - Decisions/2026-11-21 Online gateway code removed`.)
- `AGENTS.md` declares two surfaces: static `web/` (plain HTML/CSS/JS calling `/api` from the browser) and Django `templates/` + `components/` + `static/` (Tailwind/daisyUI, HTMX, Alpine, django-components, Lucide). `templates/` cannot be retired because `accounts/accept_invite.html` serves the emailed invite. (`PROJECT-LOG.md`, 2026-10-18 17:40.)
- `/` is served by Django (`WHITENOISE_INDEX_FILE = False`, `views.home` → `web/welcome.html`); a synchronous auth guard in protected page heads hides the page before first paint and redirects unauthenticated visitors. (`PROJECT-LOG.md`, 2026-11-14 02:56.)
- Vercel's `buildCommand` must **not** run `manage.py migrate`: build containers have no database access. Missing columns are handled at runtime with savepoints and an idempotent schema check (`_ensure_announcements_schema()`), returning HTTP 400 rather than 500. (`PROJECT-LOG.md`, 2026-11-14 00:24 and 01:05.)
- Streak and weekly-visit counts are computed server-side in `GET /api/member/me/` with Manila-local dates; member check-in calls `check_in_member` through `POST /api/member/check-in/`. (`PROJECT-LOG.md`, 2026-10-29 17:09; 2026-11-08 12:57.)
- Skeleton loaders are placed in the real HTML containers with a short minimum and a hard fallback; theme/layout state is set on `<html>` in a head script before first paint to avoid flicker. (`PROJECT-LOG.md`, 2026-10-29 17:00; undated "Session: sidebar per drawing…" entry.)
- The PWA/service-worker files `web/sw.js` and `web/pwa.js` are deleted — offline caching of member and payment data on shared front-desk phones is out of scope. (`PROJECT-LOG.md`, 2026-11-16 11:00.)
- The manifest is a static `web/manifest.webmanifest` served by `WHITENOISE_ROOT = web`; `.webmanifest` is registered in `WHITENOISE_MIMETYPES` as `application/manifest+json`, because Python does not know the extension. All pages use one `theme-color` (`#0a0e17`). (`PROJECT-LOG.md`, 2026-11-16 12:10.)
- Trainer endpoints live in `api/trainers.py`, `api/notifications.py`, `api/urls.py`; the bell popover and Notifications page share one server-synced store and the `pf:notifications-updated` event. (`PROJECT-LOG.md`, 2026-11-15 09:13; 2026-11-15 10:02.)

## Not yet inspected

- Row Level Security policies in the live Supabase project — Unknown.
- Whether the `pg_cron` job is applied — Unknown (`ROADMAP.md` phase 3 has no record).
- Migration file contents (`apps/**/migrations/`) — listed, not read.
- `apps/accounts/adapters.py` internals and every DRF permission class body — not read in full.
