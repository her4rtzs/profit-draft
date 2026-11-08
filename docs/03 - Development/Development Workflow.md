# Development Workflow

## Prerequisites

| Need | Version / note | Evidence |
| --- | --- | --- |
| Python | 3.13 (repo pins `3.13`; this machine has 3.13.14) | `.python-version`, `python --version` |
| Python deps | `requirements.txt` (Django 5.1.4, DRF, django-environ, psycopg, whitenoise, argon2-cffi, django-components) | `requirements.txt` |
| Node + npm | Only for `static/src` (Tailwind build) and `mobile/` (Expo) | `static/src/package.json`, `mobile/package.json` |
| Database | None required locally: `DATABASE_URL` unset falls back to SQLite | `profit/settings.py` (`DATABASES`) |

Current machine state (verified, not assumed): no `.venv/`, no `db.sqlite3` (both git-ignored), global Python has **Django 5.2.1** but **`django-environ` is missing**, so `python manage.py …` fails on `import environ`. `ruff` is not installed and is not in `requirements.txt`.

## Setup

From the repo root (`README.md` lines 59–80):

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # Windows; source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env               # optional for local dev
python manage.py migrate
```

`.env.example` lists the variable **names** only; values stay out of the repo and `.env` is git-ignored (`.gitignore`, `README.md` line 104). With `DATABASE_URL` unset the app runs fully offline on SQLite.

## Running locally

| Target | Command | Evidence |
| --- | --- | --- |
| Backend + Django pages + `/api` | `python manage.py runserver` | `README.md` line 77 |
| Default port | 8000 (`SITE_BASE_URL` defaults to `http://localhost:8000`) | `profit/settings.py` |
| Static portal preview only | serve `web/` with any static server, e.g. `python -m http.server 8000 --directory web` | In production WhiteNoise serves `web/` at the site root (`WHITENOISE_ROOT`); in this mode `/api/*` returns 404, so pages fall back to demo/empty data |
| Mobile app | `cd mobile && npm.cmd install && npm.cmd start`, then open in Expo Go or a simulator | `mobile/README.md` lines 17–26 |
| Mobile API target | `app.json → expo.extra.apiBaseUrl` (default `http://localhost:8000`) | `mobile/app.json`, `mobile/config.js` |

`mobile/README.md` notes that PowerShell blocks the `npm` shim on the dev machine; use `npm.cmd`.

## Build

```bash
npm --prefix static/src install
npm --prefix static/src run build    # tailwindcss -i ./input.css -o ../dist/app.css --minify
python manage.py collectstatic --noinput
```

This is exactly the Vercel build (`vercel.json` `buildCommand`). `static/dist/` is git-ignored and **absent in a fresh checkout**, so the Django portal renders unstyled until the build runs. Tailwind scans `templates/`, `components/` and `apps/**/templates/` (`static/src/tailwind.config.js`) with daisyUI's `light` theme.

Deployment shape (`vercel.json`): one serverless function `api/index.py` exporting `profit.wsgi.application`; every path is rewritten to it (`"/(.*)" → "/api"`); static files are served by WhiteNoise from inside the function; `outputDirectory` is `staticfiles`.

## Inspect

- API routes: `api/urls.py` (auth, join, member, staff, announcements, notifications, trainers, `/api/membership/`, `/api/attendance/`, `/api/staff/members/`).
- Root routes: `profit/urls.py` (`/`, `admin/`, `api/`, `accounts/`, `membership/`, `finance/`, `webhooks/paymongo/`).
- Settings and environment names: `profit/settings.py`, `.env.example`.
- Bulk logic: services under `apps/*/services.py`; models under `apps/*/models.py`; webhook in `apps/billing/webhooks.py`.
- Front-end entry points: `web/config.js` (config + shared browser stores), `web/api.js` (fetch client with CSRF), `web/layout.js`, `web/pages.js`.
- Component/browser state (timetable, gym contact, notifications) is seeded in `web/config.js`.

## Change

Project rules live in `AGENTS.md`:

- Business logic in services/models, not views or serializers.
- Enrollment logic stays in `apps/membership/` — staff, webhook and desk-payment paths all call it.
- Tests are required for changes to billing, auth, permissions or enrollment.
- Never log PII or payment details; never commit secrets.
- Do not edit applied migrations — add a new one.
- Web UI: django-components, daisyUI before custom CSS, HTMX for partial updates, Alpine only for small local state; no React in the web portal.
- Append one entry to `PROJECT-LOG.md` at the end of every session; append only.
- After changing a static asset referenced by `web/*.html`, bump its `?v=` query so the browser does not serve the cached copy (observed convention, e.g. `layout.js?v=18`).

## Not yet inspected

- Exact Vercel project settings / environment variables on the deployed site — Unknown.
- Supabase connection details and whether the project is on the transaction-mode pooler — Unknown.
- `mobile/README.md` references `mobile/api/client.js` and `mobile/screens/MembershipScreen.js`; the files exist under `mobile/api/` and `mobile/screens/` but were not read.
