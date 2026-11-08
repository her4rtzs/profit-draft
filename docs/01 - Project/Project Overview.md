# Project Overview

## Purpose

Gym operations system for Functional Fitness Gym. It replaces paper logbooks and group-chat financial reports with a single backend that serves a staff web portal and a member mobile app. Both talk to one Django + Django REST Framework backend and one Supabase PostgreSQL database. (`README.md` lines 1–7)

## Users

Four fixed roles, single-sourced in `apps/accounts/models.py` (`Role`: `OWNER`, `CASHIER`, `TRAINER`, `MEMBER`) and enforced by the pure functions in `apps/accounts/permissions.py`:

| Role | Who | What they can do |
| --- | --- | --- |
| Owner | Gym owner | Everything, including financial dashboard and reports (`can_view_financials`), staff invites (`can_manage_staff_invites`) |
| Cashier | Front desk | Enrollment, payments, attendance (`can_manage_enrollment`, `can_view_attendance`) |
| Personal Trainer | Coach | Attendance for anyone; member profiles |
| Member | Gym customer | Own profile, own attendance, own payment only (`can_initiate_payment`, `can_view_attendance` check `member.user_id == user.pk`) |

The browser-facing API maps backend roles to three shells: `OWNER`/`CASHIER` → `ADMIN`, `TRAINER` → `TRAINER`, `MEMBER` → `MEMBER` (`api/auth.py`, `WEB_ROLE`).

## Capabilities

| Area | What exists | Evidence |
| --- | --- | --- |
| Accounts | Custom user with role; email-as-username login; email OTP signup; Owner staff invites; change password; forgot/reset password | `apps/accounts/models.py` (`User`, `EmailOTP`, `StaffInvite`), `apps/accounts/views.py`, `api/auth.py` |
| Membership | `MemberProfile` (status `PENDING`/`ACTIVE`/`EXPIRED`, expiry date, phone, address, `photo_data`), `Enrollment`, `Attendance`; enroll / renew / check-in services | `apps/membership/models.py`, `apps/membership/services.py` |
| Billing | PayMongo Checkout Sessions, pay-first join via `PendingSignup`, webhook with HMAC verification and idempotency ledger, paid/failed single-writer mutators | `apps/billing/models.py`, `apps/billing/services.py`, `apps/billing/webhooks.py` |
| Finance | Desk payments (`ManualPayment`: cash / GCash / bank), monthly totals across desk + online payments | `apps/finance/models.py`, `apps/finance/services.py` (`record_desk_payment`, `monthly_summary`) |
| Announcements | Staff draft/publish/archive, audience ALL or SELECTED with recipients | `apps/announcements/models.py` |
| Notifications | Per-recipient stored notifications with read state and link | `apps/notifications/models.py` |
| Trainers | Trainer profile with capacity, member assignment, member request with approve/decline | `apps/trainers/models.py` |
| Staff web portal | Static HTML/CSS/JS pages in `web/` (dashboard, members, attendance, payments, reports, trainers, announcements, settings, profile, login, welcome, FAQ, terms, privacy) plus Django-templated pages in `templates/` | `web/`, `templates/`, `profit/settings.py` (`WHITENOISE_ROOT = BASE_DIR / "web"`) |
| Member portal / PWA | `web/member-home.html`, `web/join.html`, installable shell with service worker | `web/manifest.webmanifest`, `web/sw.js`, `web/pwa.js` |
| Mobile app | Expo skeleton: one membership screen driving the session+CSRF auth sequence | `mobile/README.md`, `mobile/app.json`, `mobile/package.json` |

## Technology and dependencies

| Layer | Technology | Evidence |
| --- | --- | --- |
| Backend | Python 3.13, Django 5.1.4, Django REST Framework 3.15.2, django-environ, psycopg 3.2.10, whitenoise, argon2-cffi, django-components 0.100 | `requirements.txt`, `.python-version` |
| Database | SQLite fallback locally; Supabase PostgreSQL (transaction-mode pooler) in production | `profit/settings.py` (`DATABASES`) |
| Staff portal (static) | Plain HTML/CSS/vanilla JS, no build step; Font Awesome and Google Fonts from CDNs; ProFit PWA shell | `web/`, `web/sw.js`, `web/config.js` |
| Staff portal (Django) | Django templates, Tailwind + daisyUI compiled at build time, HTMX, Alpine.js, Lucide icons, django-components | `static/src/package.json`, `static/src/tailwind.config.js`, `static/vendor/`, `components/` |
| Mobile | Expo 52, React Native 0.76.5, NativeWind 4.1.23, react-native-reusables, lucide-react-native | `mobile/package.json` |
| Deploy | Vercel serverless function (`api/index.py` → `profit.wsgi`), WhiteNoise static files, build runs npm build then `collectstatic` | `vercel.json`, `api/index.py` |
| Payments | PayMongo, test-mode account only, methods from `PAYMONGO_PAYMENT_METHODS` | `profit/settings.py`, `Architecture.md` §13 |
| Scheduled jobs | Supabase `pg_cron` for membership expiry (SQL written but commented out) | `supabase/cron/membership_expiry.sql` |
| Email | Resend HTTP backend when `RESEND_API_KEY` is set, console backend otherwise | `profit/settings.py` (`EMAIL_BACKEND`), `apps/accounts/email_backends.py` |

## Known limitations

- **Serverless only.** No background workers; scheduled work must be `pg_cron` or webhooks (`README.md` lines 116–121).
- **Payment status is webhook-only.** `create_payment_intent` in `apps/billing/services.py` raises `NotImplementedError`; the live path is Checkout Sessions + webhook.
- **Expiry job not applied.** `supabase/cron/membership_expiry.sql` schedules the job inside comments and `ROADMAP.md` phase 3 has no record that it was applied. Access still checks `expiry_date` (`MemberProfile.is_active_on`), so an unrun job does not grant free access (`Architecture.md` §6).
- **No login rate limiting** (`ROADMAP.md` phase 1 gap, phase 6 item).
- **No CI and no declared linter.** `ruff` is not in `requirements.txt`; no `.github/` directory; `ruff` is not installed in this environment.
- **Member photo is a base64 data URL**, not Supabase Storage (`MemberProfile.photo_data`; `ROADMAP.md` phase 2 deviation).
- **Financial reporting incomplete:** no server-side PDF, no status filter (paid/pending/failed listing), no reconciliation view (`ROADMAP.md` phase 4).
- **Two overlapping web surfaces.** Static `web/` pages and Django `templates/` pages both exist; `ROADMAP.md` phase 6 lists "keep both or converge" as undecided.
- **Mobile app is a skeleton.** `mobile/package.json` `test` script is a no-op stub; `ROADMAP.md` phase 5 is "Not started".
- **Local stylesheet build output is absent.** `static/dist/` is referenced by `profit/settings.py` `STATICFILES_DIRS` and git-ignored, so it must be generated before the Django portal renders styled pages.

## Not yet inspected

- `templates/*.html` and `components/*` were listed, not reviewed line by line.
- Migration files under `apps/**/migrations/` were listed, not read.
- `.agents/tasks/**` planning/review documents were listed, not read.
- Live Supabase project state (RLS policies, applied `pg_cron` job) — Unknown; not checked.
- Browser, mobile-emulator and production runtime behaviour — Unknown for this pass (tests were not run).
