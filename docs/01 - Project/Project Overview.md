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
| Membership | `MemberProfile` (status `PENDING`/`ACTIVE`/`EXPIRED`/`TRIAL`, expiry date, `trial_ends_at`, phone, address, `photo_data`), `Enrollment`, `Attendance`; enroll / renew / check-in / trial services | `apps/membership/models.py`, `apps/membership/services.py` |
| Billing | Free sign-up creates a `TRIAL`; GCash `PaymentClaim` records with staff review and one-transaction enrollment; old `Payment`/`Subscription`/`WebhookEvent`/`PendingSignup` history kept read-only | `apps/billing/models.py`, `apps/billing/services.py`, `api/claims.py`, `api/staff_claims.py` |
| Finance | Desk payments (`ManualPayment`: cash / GCash), GCash claims, monthly totals across desk + approved claims + old online history | `apps/finance/models.py`, `apps/finance/services.py` (`record_desk_payment`, `monthly_summary`) |
| Announcements | Staff draft/publish/archive, audience ALL or SELECTED with recipients | `apps/announcements/models.py` |
| Notifications | Per-recipient stored notifications with read state and link | `apps/notifications/models.py` |
| Trainers | Trainer profile with capacity, member assignment, member request with approve/decline | `apps/trainers/models.py` |
| Staff web portal | Static HTML/CSS/JS pages in `web/` (dashboard, members, attendance, payments, reports, trainers, announcements, settings, profile, login, welcome, FAQ, terms, privacy) plus Django-templated pages in `templates/` | `web/`, `templates/`, `profit/settings.py` (`WHITENOISE_ROOT = BASE_DIR / "web"`) |
| Member portal / PWA | `web/member-home.html`, `web/join.html`, installable shell with service worker | `web/manifest.webmanifest`, `web/sw.js`, `web/pwa.js` |

## Technology and dependencies

| Layer | Technology | Evidence |
| --- | --- | --- |
| Backend | Python 3.13, Django 5.1.4, Django REST Framework 3.15.2, django-environ, psycopg 3.2.10, whitenoise, argon2-cffi, django-components 0.100 | `requirements.txt`, `.python-version` |
| Database | SQLite fallback locally; Supabase PostgreSQL (transaction-mode pooler) in production | `profit/settings.py` (`DATABASES`) |
| Staff portal (static) | Plain HTML/CSS/vanilla JS, no build step; Font Awesome and Google Fonts from CDNs; ProFit PWA shell | `web/`, `web/sw.js`, `web/config.js` |
| Staff portal (Django) | Django templates, Tailwind + daisyUI compiled at build time, HTMX, Alpine.js, Lucide icons, django-components | `static/src/package.json`, `static/src/tailwind.config.js`, `static/vendor/`, `components/` |
| Deploy | Vercel serverless function (`api/index.py` → `profit.wsgi`), WhiteNoise static files, build runs npm build then `collectstatic` | `vercel.json`, `api/index.py` |
| Payments | Cash and staff-reviewed GCash claims; no online gateway. Old online rows are kept as paymongo history | `AGENTS.md` Payments, `apps/finance/services.py`, `apps/billing/models.py` |
| Scheduled jobs | Supabase `pg_cron` for membership expiry (SQL written but commented out) | `supabase/cron/membership_expiry.sql` |
| Email | Resend HTTP backend when `RESEND_API_KEY` is set, console backend otherwise | `profit/settings.py` (`EMAIL_BACKEND`), `apps/accounts/email_backends.py` |

## Known limitations

- **Serverless only.** No background workers; scheduled work must be `pg_cron` or webhooks (`README.md` lines 116–121).
- **Trial expiry is computed per request.** `member_access` reads `trial_ends_at` on each call; there is no gateway webhook and no scheduled job for trial access.
- **Expiry job not applied.** `supabase/cron/membership_expiry.sql` schedules the job inside comments and `ROADMAP.md` phase 3 has no record that it was applied. Access still checks `expiry_date` (`MemberProfile.is_active_on`), so an unrun job does not grant free access (`Architecture.md` §6).
- **No login rate limiting** (`ROADMAP.md` phase 1 gap, phase 6 item).
- **No CI and no declared linter.** `ruff` is not in `requirements.txt`; no `.github/` directory; `ruff` is not installed in this environment.
- **Member photo is a base64 data URL**, not Supabase Storage (`MemberProfile.photo_data`; `ROADMAP.md` phase 2 deviation).
- **Financial reporting incomplete:** no server-side PDF, no status filter (paid/pending/failed listing), no reconciliation view (`ROADMAP.md` phase 4).
- **Two overlapping web surfaces.** Static `web/` pages and Django `templates/` pages both exist; `ROADMAP.md` phase 6 lists "keep both or converge" as undecided.
- **Local stylesheet build output is absent.** `static/dist/` is referenced by `profit/settings.py` `STATICFILES_DIRS` and git-ignored, so it must be generated before the Django portal renders styled pages.

## Log backfill (facts stated in PROJECT-LOG.md, cited by entry date)

- The product is **one portal with one login**; the user's role decides which pages they see. Staff and members use the same portal, which is installable on a phone home screen. (`PROJECT-LOG.md`, 2026-10-18 17:40; 2026-11-16 11:00.)
- The installable app has a public manifest, four icons exported from the approved logo, head tags on every page and an install card on staff settings, trainer settings and member home. There is no service worker, offline cache or push; the real-phone check is still open. (`PROJECT-LOG.md`, 2026-11-16 11:00; 2026-11-16 12:10.)
- A `daily` plan at ₱80 / 1 day was added on 2026-11-08; plan keys must be added in four places (`apps/finance/services.py`, `apps/membership/services.py`, `web/data.js`, `web/pages.js`) plus the static join page. (`PROJECT-LOG.md`, 2026-11-08 12:38.)
- Members can check in themselves through `POST /api/member/check-in/`, which goes through the shared `check_in_member` service with same-day idempotency; live state comes from the server and demo storage is used only offline. (`PROJECT-LOG.md`, 2026-11-08 12:57; 2026-11-08 13:10.)
- `GET /api/member/me/` requires authentication and returns real subscription, enrollment and payment records with clamped remaining days; API failures show an explicit error/retry instead of demo data. (`PROJECT-LOG.md`, 2026-11-16 08:18.)
- Trainer subpages share one stylesheet and are backed by real trainer check-in, announcements, profile, schedule and attendance endpoints; notifications are stored and synced from the server rather than seeded in the page. (`PROJECT-LOG.md`, 2026-11-15 09:13; 2026-11-15 10:02.)
- Payments: public copy now describes a free seven-day trial and cash or GCash desk payments; the old QR Ph and online-checkout wording was removed. (`AGENTS.md` Payments; `web/welcome.html`, `web/faq.html`, `web/terms.html`, 2026-11-21.)
- The decorative CSS layer was removed from 13 `web/` files (+56/−392) on 2026-11-19; the palette merge, `!important` reduction and bundling were deliberately left for later. (`PROJECT-LOG.md`, 2026-11-19 09:10.)

## Not yet inspected

- `templates/*.html` and `components/*` were listed, not reviewed line by line.
- Migration files under `apps/**/migrations/` were listed, not read.
- `.agents/tasks/**` planning/review documents were listed, not read.
- Live Supabase project state (RLS policies, applied `pg_cron` job) — Unknown; not checked.
- Browser, mobile-emulator and production runtime behaviour — Unknown for this pass (tests were not run).
