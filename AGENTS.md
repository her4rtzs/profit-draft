# ProFit: Gym Operations Management System

Gym operations system for Functional Fitness Gym. Replaces paper logbooks and group-chat financial reports. Staff and members use one web portal (one login; the user's role decides which pages they see), installable on a phone's home screen. It talks to one Django backend and one Supabase PostgreSQL database.

Architecture: see `Architecture.md` (read the relevant section on demand, not the whole file).

## How to work with the owner (read this first)
The owner is a student who is still learning and is building this as they go. Assume they do not know the jargon. Always:
- Give the **simplest route and ONE recommended path**. No menus of alternatives.
- Explain **why** in plain language, not just what. Explain a new term (migration, webhook, serverless, RBAC, idempotent...) in one short sentence the first time.
- Prefer point-and-click steps (VS Code Source Control, the Supabase dashboard, the Vercel dashboard) over long terminal sequences. When a command is unavoidable, give the exact command and say what it does.
- **Stay on the thing asked.** Do not jump ahead to the next phase or feature. If a request belongs to a later phase in `ROADMAP.md`, say so and ask before proceeding.
- If the request is unclear or risky, ask ONE short question before writing code.
- Work on a feature branch in small, reviewable changes. Do not commit, push, deploy, or open PRs unless asked.
- Before finishing, run `ruff check .`, `python manage.py check`, and `python manage.py test`. They must pass. Then list the exact manual steps the owner can follow to test the change (what to click, what they should see).
- When you finish a roadmap item, check it off in `ROADMAP.md` in the same change. Do not mark a phase complete until its gate checks (in `Architecture.md`) pass; tell the owner and stop.

## Current phase
Phase 4 (Financial Dashboard) is in progress. Phase 4.5 (Installable Web App) is implemented and its code is done, but its real-phone gate has not been run, so it is **not** complete. Do not start Phase 5 or later until the current phase's exit check passes. `ROADMAP.md` holds the item lists; record what was checked in `docs/PROGRESS.md`.

## Stack
- Web portal (staff and members), static pages (`web/`): HTML, CSS and JavaScript; Font Awesome and Google Fonts via CDN; calls the Django API from the browser
- Web portal, Django pages (`templates/`, `static/`): HTML, CSS and JavaScript served through Django templates
- Backend: Django + Django REST Framework (the JSON API used by the `web/` pages), deployed as serverless functions on Vercel
- Database: Supabase PostgreSQL, accessed through the Django ORM
- Files: Supabase Storage via `django-storages` (PDFs, profile images)
- Payments: PayMongo, **individual (unregistered) account, test mode only**, QR Ph only (this is a project, not a live business; see Payments section)
- Scheduled jobs: Supabase `pg_cron`
- Free tier only (Vercel and Supabase free plans). Do not suggest paid services.
- There is no native mobile app. Do not add React Native, Expo, or a `mobile/` folder.

## Commands
Run from repo root:
- Install: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- Run dev server: `python manage.py runserver` (restart it after changing `.env`)
- Run tests: `python manage.py test`
- Lint / format: `ruff check . && ruff format .`
- Check config: `python manage.py check`
- Make migrations: `python manage.py makemigrations`
- Apply migrations: `python manage.py migrate` (see Golden rules: Dev database only, and only when the owner says so)

## Golden rules (safety and security)
Each of these exists to prevent a real, costly mistake. Do not bend them.
1. **Never run commands that write to the production database.** There are two Supabase projects: **Dev** (what the local `.env` points to) and **Prod** (the live site). Before any `migrate`, `loaddata`, `flush`, or shell command that changes data, check that `DATABASE_URL` points to Dev. If you cannot tell, stop and ask. For Prod, create the migration file and tell the owner to apply it.
2. Every schema change is a new tracked Django migration. Never edit tables by hand in the Supabase dashboard, and never edit applied migrations.
3. **Never read, print, or commit `.env*` files or secrets.** Environment variable names are listed at the bottom of this file. Never paste a secret into code, a test, a log, a vault note, or a chat reply.
4. `SUPABASE_KEY` and `PAYMONGO_SECRET_KEY` are used only in server-side Django code. Never put them in templates, JavaScript, `web/` pages, or any API response.
5. **Permissions are enforced on the server.** Hiding a button or menu item is only UX. Every role check in a page needs a matching check in the Django view or DRF endpoint (login required, correct role, and the user is active).
6. Never trust client-supplied values for security-relevant fields (`role`, `member_id`, `amount`, `status`, `created_by`, payment status). Derive them server-side. Take payment amounts from the server-side price, never from the request.
7. Validate all input with Django forms or DRF serializers. Never build queries by string concatenation.
8. Handle errors on every external call (PayMongo, Supabase Storage). Do not swallow exceptions silently. In browser JavaScript `fetch` calls, use `try/catch/finally` so loading states always end and buttons can never get stuck.
9. Supabase exposes tables through its own public Data API. This app only uses Django, so every table in the `public` schema must have Row Level Security (RLS) **enabled with no policies** (this blocks the public API; Django's database connection is not affected). When you add a table, tell the owner to enable RLS on it, and record it in `PROJECT-LOG.md`.
10. Users and members are **never deleted**, only deactivated (`is_active = False`). Payment and attendance history must stay intact for the Financial Dashboard.

## Repo layout
<!-- Assumed monorepo layout. Adjust if yours differs. -->
- `manage.py`, `requirements.txt`, `vercel.json`: backend entry points and deploy config
- `profit/`: Django project (settings, urls, wsgi)
- `apps/membership/`: enrollment (staff-assisted and self-service), attendance, member profiles (Module 1)
- `apps/billing/`: subscriptions, PayMongo integration, webhook receiver; triggers auto-enrollment on paid signup (Module 2)
- `apps/finance/`: transaction history and reports (Module 3)
- `apps/accounts/`: users, roles, RBAC permissions
- `api/`: DRF serializers and viewsets for the `web/` pages
- `web/`: static portal pages (HTML/CSS/JS), served by WhiteNoise at the site root
- `templates/`, `static/`: Django-templated pages (HTML templates, plus CSS and JS)
- `supabase/cron/`: `pg_cron` SQL definitions
- `docs/`: Obsidian vault (project notes, one note per decision in `05 - Decisions/`, and the Decision Log index). Open this folder in Obsidian with "Open folder as vault".
- `PROJECT-LOG.md`, `ROADMAP.md`, `Architecture.md`: session log, work checklist, and design plan

## Modules
1. **Membership**: enrollment, attendance records, member profiles. Enrollment happens two ways: staff enroll members on the web portal, or members self-enroll (sign up and pay via PayMongo, then the system enrolls them automatically with no staff action). Members use the same portal to view their own profile, attendance, and membership status.
2. **Billing & Subscription**: gym subscription payments through PayMongo (2.2), including the first payment that triggers self-service enrollment. Desk payments (cash, GCash, bank) are recorded by staff. A `pg_cron` job (2.1) expires memberships automatically.
3. **Financial Dashboard**: transaction history (3.1) and financial reports (3.2). Owner only.

## Request flow
- Pages call DRF endpoints (`web/` pages) or are rendered by Django views. Both create PayMongo payments.
- PayMongo reports results asynchronously to the webhook receiver, which updates payment status through the ORM.
- Self-enrollment flow:
  1. A visitor signs up on the web portal. This creates a user with the Member role and a member profile in `pending` status (not enrolled, no gym access).
  2. The app creates a PayMongo checkout for the enrollment/subscription fee.
  3. When the webhook reports the payment as paid, the handler, in one database transaction, marks the payment paid, enrolls the member (status `active`), and sets the membership expiry. No staff step is involved.
  4. Failed or abandoned payments leave the member `pending`.
- Staff-assisted enrollment (walk-ins, desk payments) still exists and uses the same membership enrollment service as the webhook path.
- `pg_cron` updates membership expiry directly in the database and bypasses Django. This is the one exception to "everything goes through the ORM".

## Rules
- Use the Django ORM for all application database access. No raw SQL in app code.
- Keep business logic out of views and serializers where practical; put it in services or models.
- Enrollment logic (creating or activating a membership, setting expiry) lives in one service in `apps/membership/`. Staff views and the webhook handler both call it. Do not duplicate it.
- Add or update tests for any change to billing, auth, permissions, or enrollment.
- Never log PII (names, contact details) or payment details.
- Never commit secrets. Read them from environment variables.
- Reuse before creating: check existing pages, partials, CSS classes, JS helpers, and services before writing new ones.
- Web UI: HTML, CSS, and JavaScript only. Keep CSS in one place with colors, spacing, and font sizes as CSS variables in `:root`; never hard-code the same hex color in many places. Design phone-first (members use the portal on their phones) and keep tap targets comfortable. Keep JavaScript small, with `addEventListener` instead of inline handlers.
- Every form field needs a matching `<label for>` and `id`. Every Django POST form includes `{% csrf_token %}`.
- Do not add dependencies outside the Stack section. If a new package seems necessary, ask first and explain why the existing stack can't do it.
- Keep changes small and focused. Do not refactor, rename, or reformat code unrelated to the task. (The only standing exception is the decision notes described below.)
- Assume timezone `Asia/Manila` and currency PHP.
- Do not edit applied migrations; add a new one.

## Session log
At the end of every session, append one entry to `PROJECT-LOG.md` at the repo root. Create the file if it does not exist. Append only: never edit or delete earlier entries. Do not include secrets, PII, or payment details. Read the last few entries at the start of a session to see the current state. End your reply with the same entry's "What the agent decided and why" in short form, so the owner can paste it into another session.

Entry format:
```
## YYYY-MM-DD HH:MM (Asia/Manila): <short session title>
### What I asked for
<the user's request(s) this session, in one to three lines>
### What the agent decided and why
<One line per decision. Add "see [[<decision note name>]]" if the decision also has a decision note. Keep the full reasoning in the decision note, not here.>
### Decision-log skill
<the reusable pattern or lesson from this session that future sessions should apply>
```

## Decision notes (Obsidian vault)
The `docs/` folder is an Obsidian vault. Every non-obvious decision gets its **own note** (one decision = one file) in `docs/05 - Decisions/`. After creating it, add one link line to the index note `docs/05 - Decisions/Decision Log.md`. Do this before you end your reply.

What counts as a decision: choosing one approach over another, adding or skipping a dependency, changing the database schema, changing a permission or security rule, or deciding something is out of scope for the current phase. Typos and small formatting fixes do not count.

Rules:
- One decision = one new file. File name: `YYYY-MM-DD Short title.md`, for example `2026-11-19 Use scroll-snap for Programs.md`. Do not use these characters in the name: `: / \ ? * " < > |`. Keep it under about 60 characters. Never rename a decision file later, because links to it would break.
- Use this exact template for the note:
```
---
date: YYYY-MM-DD
status: accepted
tags: [decision]
---
# <short title>
- Decision: <what was decided>
- Reason: <why, in plain language>
- Trade-offs: <what was given up or risked>
- Evidence: <file paths changed, test results, or commit hash if one exists>

## Related
- [[<exact name of an existing note>]]
```
- Under "Related", link only to notes that already exist, using their exact file name (for example `[[System Architecture]]`, `[[Testing Strategy]]`, or an earlier decision note). If nothing is related, write "None".
- Then append one line at the bottom of `Decision Log.md`: `- [[YYYY-MM-DD Short title]]: <one-line summary>`. Newest at the bottom. Do not rewrite or reorder the rest of that file.
- Never edit or delete an existing decision note. The only allowed change is setting `status` to `superseded` or `reversed` and adding one line `Superseded by: [[new note name]]`. A new decision that replaces an old one must link to the old one under "Related".
- Evidence must be real. If you did not check something, write "Not yet inspected". Do not guess.
- Never write secrets, `.env` values, PII, or payment details into the vault.
- This is the one exception to "keep changes small": you may create and edit files inside `docs/` for this purpose. Do not edit any other docs file unless asked.
- Do not commit. Tell the owner to review the `docs/` changes with the rest of the diff.
- `PROJECT-LOG.md` stays as the per-session log. Decision notes hold the individual decisions that matter later.

## Payments (PayMongo)
- Amounts are in centavos (PHP 100.00 = `10000`).
- This project uses a PayMongo **individual (unregistered) account**. That account type supports **QR Ph (`qrph`) only**. Do not expose GCash, Maya, cards, online banking, or any other PayMongo method. (The PayMongo Wallet is where the account's funds settle; it is not a way for members to pay, so do not build a "Wallet" checkout option.)
- The methods offered live in one setting, `PAYMONGO_PAYMENT_METHODS`, set to `qrph`. Checkout pages and the code that creates the PayMongo checkout must both read from it.
- **Test mode only, in every environment** (local and the deployed demo). Use PayMongo test keys only; live keys are not available on an individual account and must never be added. No real money is processed. Tell the owner how to register the test webhook in the PayMongo dashboard (the deployed Vercel URL, or a tunnel for local testing).
- Desk payments (cash, GCash, bank) are recorded by staff and never go through PayMongo.
- Verify the webhook signature before processing any event.
- Webhook handlers must be idempotent: the same event may be delivered more than once.
- Only the webhook sets a payment to paid or failed. Never trust the browser redirect.
- Only the webhook triggers self-enrollment. Never enroll a member because the browser redirect or a page says payment succeeded.
- Payment confirmation and enrollment must succeed or fail together (single transaction). A duplicate webhook delivery must not create a second enrollment or extend the expiry twice.
- Match the paid event to the pending member and payment stored server-side. Do not trust member identifiers sent in webhook metadata alone without verifying them against the stored record.

## Auth & roles (RBAC)
Roles: Owner, Cashier, Personal Trainer, Member. Enforce permissions server-side on both views and DRF endpoints. There is **one portal and one login**: after logging in, the user's role decides which pages and menu items they get.

| Area | Owner | Cashier | Trainer | Member |
|---|---|---|---|---|
| Financial Dashboard / reports | Yes | No | No | No |
| Record payments | Yes | Yes | No | Own only |
| Membership enrollment (staff-assisted) | Yes | Yes | No | No |
| Self-enrollment (sign up + pay) | n/a | n/a | n/a | Own only, completed automatically by the webhook |
| Attendance records | Yes | Yes | Yes | View own |
| Own profile | Yes | Yes | Yes | Yes |

Public sign-up may only create the Member role. It must never allow choosing or escalating to Owner, Cashier, or Personal Trainer; the Owner assigns staff roles. A member who has signed up but not paid is `pending` and has no member-level access (attendance, subscription features) until enrolled.

Every staff-only view and DRF endpoint must check, on the server: the user is logged in, has the correct role, **and is active**. Never assume a layout, menu, or parent template already protected the page. A member may only read and change their own records (always filter by the logged-in user, never by an id from the request alone).

Passwords use Django's password hashers (confirm `PASSWORD_HASHERS` in settings). All traffic must be HTTPS.

## Deployment constraints (Vercel + Supabase)
- Serverless: no background workers, no persistent local filesystem, and function timeouts apply. Use `pg_cron` or webhooks instead of in-process jobs.
- Use the Supabase pooler in transaction mode; set `DISABLE_SERVER_SIDE_CURSORS = True` and keep `CONN_MAX_AGE` low or zero.
- Serve static files via a serverless-compatible approach (for example WhiteNoise). Do not rely on local disk.
- `pg_cron` jobs are not managed by Django migrations. Their SQL lives in `supabase/cron/` and must be applied manually or via a documented script. Write the SQL file, then tell the owner exactly where to paste it in the Supabase dashboard. Never apply it yourself.
- Never run `vercel` deploy commands or change Vercel/Supabase dashboard settings. Tell the owner what to change and why.

## Environment variables (names only)
`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`