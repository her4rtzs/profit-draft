# Development Workflow

## Prerequisites

| Need | Version / note | Evidence |
| --- | --- | --- |
| Python | 3.13 (repo pins `3.13`; this machine has 3.13.14) | `.python-version`, `python --version` |
| Python deps | `requirements.txt` (Django 5.1.4, DRF, django-environ, psycopg, whitenoise, argon2-cffi, django-components) | `requirements.txt` |
| Node + npm | Only for `static/src` (Tailwind build) | `static/src/package.json` |
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
- Root routes: `profit/urls.py` (`/`, `admin/`, `api/`, `accounts/`, `membership/`, `finance/`).
- Settings and environment names: `profit/settings.py`, `.env.example`.
- Bulk logic: services under `apps/*/services.py`; models under `apps/*/models.py`; claim submission in `api/claims.py` and review in `api/staff_claims.py`.
- Front-end entry points: `web/config.js` (config + shared browser stores), `web/api.js` (fetch client with CSRF), `web/layout.js`, `web/pages.js`.
- Component/browser state (timetable, gym contact, notifications) is seeded in `web/config.js`.

## Change

Project rules live in `AGENTS.md`:

- Business logic in services/models, not views or serializers.
- Enrollment logic stays in `apps/membership/` — staff, claim approval and desk-payment paths all call it.
- Tests are required for changes to billing, auth, permissions or enrollment.
- Never log PII or payment details; never commit secrets.
- Do not edit applied migrations — add a new one.
- Web UI: django-components, daisyUI before custom CSS, HTMX for partial updates, Alpine only for small local state; no React in the web portal.
- Append one entry to `PROJECT-LOG.md` at the end of every session; append only.
- After changing a static asset referenced by `web/*.html`, bump its `?v=` query so the browser does not serve the cached copy (observed convention, e.g. `layout.js?v=18`).

## Log backfill (facts stated in PROJECT-LOG.md, cited by entry date)

- Working environment on 2026-10-10: a `.venv` exists at the repo root and `ruff==0.9.6` was installed into it **only** to run lint/format gates; it was not added to `requirements.txt`, and linting was scoped to touched files. The "no `.venv` / ruff not installed" line in the prerequisites above describes the older 2026-10-30 pass. (`PROJECT-LOG.md`, 2026-10-10 19:45.)
- Do not commit or push until explicitly told: a 2026-10-10 session held all member-auth work in the working tree while still appending its log entry. (`PROJECT-LOG.md`, 2026-10-10 21:35.)
- Before committing, stage by explicit path, scan the real files for secret-shaped strings, leave unrelated modifications out, and do not push to `main` without an explicit request. A staged `.env.example` with real-looking Supabase credentials was unstaged for this reason. (`PROJECT-LOG.md`, 2026-10-12 10:20.)
- Before pulling into a tree with an append-only log, back up the files that both sides append to; a stash-and-pop of two end-of-file appends conflicts even when both sides are correct. (`PROJECT-LOG.md`, 2026-10-18 16:10.)
- Fetch before pushing: a teammate pushed commit `4e1812c` between fetch and push. Rebase onto it to keep history linear, and resolve `PROJECT-LOG.md` conflicts by keeping both sessions' blocks whole. (`PROJECT-LOG.md`, 2026-10-18 23:40.)
- `ROADMAP.md` lives at the repo root and `AGENTS.md` is the source of truth; plan-vs-code conflicts are recorded as owner decisions rather than silently resolved. (`PROJECT-LOG.md`, 2026-10-18 14:34.)
- To restore a historical version, `git checkout <hash> -- .` for the codebase files while keeping `PROJECT-LOG.md` append-only; commit `1090e89` was restored this way. (`PROJECT-LOG.md`, 2026-11-12 01:52.)
- Vercel's `buildCommand` is npm build + `collectstatic`, with no `manage.py migrate` (build containers have no database access). (`PROJECT-LOG.md`, 2026-11-14 01:05.)
- The decorative-CSS cleanup was committed only after `python manage.py test` passed with 206 tests; palette, `!important` and bundling work stayed out of that diff. (`PROJECT-LOG.md`, 2026-11-19 09:10.)

## Not yet inspected

- Exact Vercel project settings / environment variables on the deployed site — Unknown.
- Supabase connection details and whether the project is on the transaction-mode pooler — Unknown.
