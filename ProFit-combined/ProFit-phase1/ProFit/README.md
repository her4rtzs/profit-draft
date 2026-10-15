# ProFit — Gym Operations Management System

Gym operations system for Functional Fitness Gym. It replaces paper logbooks and group-chat financial reports with a single backend that serves both a staff web portal and a member mobile app.

- **Staff** use a Django web portal (server-rendered, HTMX-driven).
- **Members** use a React Native mobile app.
- Both talk to one Django + Django REST Framework backend and one Supabase PostgreSQL database.

> This repository is the **first-build scaffold**: a runnable, tested foundation with a vertical slice through each module. Some areas (full PayMongo payment flow, financial reporting, Supabase Storage, deploy automation) are intentionally documented stubs — see [Project status](#project-status).

## Stack

| Layer | Technology |
|---|---|
| Backend | Django + Django REST Framework, deployed as serverless functions on Vercel |
| Database | Supabase PostgreSQL via the Django ORM |
| Web (staff portal) | Django templates, Tailwind CSS, daisyUI, HTMX, Alpine.js, Lucide icons, django-components |
| Mobile (member app) | React Native (Expo), NativeWind, react-native-reusables, lucide-react-native |
| Files | Supabase Storage via `django-storages` (PDFs, profile images) — deferred |
| Payments | PayMongo (GCash, Maya, cards) |
| Scheduled jobs | Supabase `pg_cron` |

Timezone is `Asia/Manila`; currency is PHP (payment amounts are stored in centavos).

## Modules

1. **Membership** — enrollment, attendance records, member profiles. Staff manage via web; members view via mobile.
2. **Billing & Subscription** — daily gym subscription payments through PayMongo. A `pg_cron` job expires memberships automatically.
3. **Financial Dashboard** — transaction history and financial reports. Owner only.

### Roles (RBAC)

Permissions are enforced server-side on **both** Django views and DRF endpoints.

| Area | Owner | Cashier | Trainer | Member |
|---|---|---|---|---|
| Financial Dashboard / reports | Yes | No | No | No |
| Record payments | Yes | Yes | No | Own only |
| Membership enrollment | Yes | Yes | No | No |
| Attendance records | Yes | Yes | Yes | View own |
| Own profile | Yes | Yes | Yes | Yes |

## Repository layout

```
manage.py, requirements.txt, vercel.json   backend entry points and deploy config
profit/            Django project (settings, urls, wsgi)
apps/membership/   enrollment, attendance, member profiles (Module 1)
apps/billing/      subscriptions, PayMongo integration, webhook receiver (Module 2)
apps/finance/      transaction history and reports (Module 3)
apps/accounts/     users, roles, RBAC permissions
api/               DRF serializers, viewsets, and session-auth endpoints for mobile
templates/, components/, static/   staff web portal (templates, django-components, assets)
mobile/            React Native member app (see mobile/README.md)
supabase/cron/     pg_cron SQL definitions (applied manually; not Django-managed)
docs/              human-facing documentation
```

## Getting started (backend)

Requires **Python 3.13**.

```bash
# From the repo root
python -m venv .venv
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Configure environment (optional for local dev — see below)
cp .env.example .env

python manage.py migrate
python manage.py runserver
```

With `DATABASE_URL` unset, the app falls back to a local SQLite database, so it runs fully offline without a live Supabase connection — this is the intended local-dev path.

### Common commands

```bash
python manage.py check          # validate configuration
python manage.py test           # run the test suite
python manage.py makemigrations # create migrations
python manage.py migrate        # apply migrations
ruff check . && ruff format .   # lint and format
```

## Getting started (mobile)

```bash
cd mobile
npm install
npm start
```

See [`mobile/README.md`](mobile/README.md) for the member app, including the exact CSRF/session-auth request sequence it uses against the backend.

## Configuration

Copy `.env.example` to `.env` and fill in values as needed. The file documents every variable; **no real secrets live in the repo** and `.env` is git-ignored.

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Django signing key. Required in production; dev-insecure fallback when unset locally. |
| `DEBUG` | Debug mode. Off by default; set `True` for local development. |
| `ALLOWED_HOSTS` | Host allow-list (CSV). Required when `DEBUG=False` — startup fails fast if unset. Include your Vercel and custom domains. |
| `DATABASE_URL` | DB connection. Leave unset for the offline SQLite fallback. In production, target the Supabase **transaction-mode pooler** host on port **6543**. |
| `SUPABASE_URL`, `SUPABASE_KEY` | Supabase Storage integration (deferred). |
| `PAYMONGO_SECRET_KEY` | PayMongo API auth (billing). |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signature verification secret. |

## Deployment notes (Vercel + Supabase)

- Serverless: no background workers and no persistent local filesystem. Scheduled work runs via `pg_cron`; async payment results arrive via webhooks.
- Static files are served through WhiteNoise from inside the function (compiled at build time, no runtime CDN). CDN/edge static hosting is a later optimization.
- Use the Supabase pooler in transaction mode; the app sets `DISABLE_SERVER_SIDE_CURSORS = True` and `CONN_MAX_AGE = 0`.
- `pg_cron` jobs are not managed by Django migrations — their SQL lives in `supabase/cron/` and is applied manually.

## Payments (PayMongo)

- Amounts are in centavos (PHP 100.00 = `10000`).
- The webhook signature is verified before any event is processed.
- Webhook handlers are idempotent — the same event may be delivered more than once.
- **Only the webhook** sets a payment to paid or failed; the client redirect is never trusted.

## Project status

Implemented in this first build:

- Django project wired for the Supabase/Vercel constraints with an offline local-dev fallback.
- `accounts`: custom user + four-role RBAC, single-sourced and enforced on views and DRF.
- `membership` (Module 1): models, services, DRF read API (`/api/membership/me/`, `/api/attendance/`), staff web views, and the web portal shell (build-time Tailwind/daisyUI, a django-component, an HTMX partial).
- `billing` (Module 2): models, single-writer payment mutators, and a concrete race-safe, signature-verifying, idempotent PayMongo webhook receiver.
- `finance` (Module 3): model stub + Owner-only dashboard gate.
- `supabase/cron/`: membership-expiry SQL stub.
- `mobile/`: React Native skeleton that drives the session-auth sequence against the API.

Deferred (documented stubs): full PayMongo payment-intent flow, financial reporting logic, Supabase Storage wiring, and deploy automation.

## Contributing

See [`AGENTS.md`](AGENTS.md) for the project conventions: ORM-only data access, business logic in services/models, required tests for billing/auth/permissions, no PII or payment details in logs, and the session-log convention in [`PROJECT-LOG.md`](PROJECT-LOG.md).
