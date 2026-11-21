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
Phase 4 (Financial Dashboard) is in progress. Phase 4.5 (Installable Web App) is implemented and its code is done, but its real-phone gate has not been run, so it is **not** complete. Phase 4.6 (Free Trial and GCash Claim Review) is **in progress**: the PayMongo code is removed and the trial, claim and cash flows are built, but its gate checks have not been run. Do not start Phase 5 or later until the current phase's exit check passes. `ROADMAP.md` holds the item lists; record what was checked in `docs/PROGRESS.md`.

## Stack
- Web portal (staff and members), static pages (`web/`): HTML, CSS and JavaScript; Font Awesome and Google Fonts via CDN; calls the Django API from the browser
- Web portal, Django pages (`templates/`, `static/`): HTML, CSS and JavaScript served through Django templates
- Backend: Django + Django REST Framework (the JSON API used by the `web/` pages), deployed as serverless functions on Vercel
- Database: Supabase PostgreSQL, accessed through the Django ORM
- Files: Supabase Storage via `django-storages` (PDFs, profile images)
- Payments: **cash and GCash only**, with no online payment gateway. Cash is taken at the desk; a GCash payment is a claim (reference number plus a screenshot link) that the Owner or Cashier must approve before it enrolls anyone (see Payments section)
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
4. `SUPABASE_KEY` is used only in server-side Django code. Never put it in templates, JavaScript, `web/` pages, or any API response.
5. **Permissions are enforced on the server.** Hiding a button or menu item is only UX. Every role check in a page needs a matching check in the Django view or DRF endpoint (login required, correct role, and the user is active).
6. Never trust client-supplied values for security-relevant fields (`role`, `member_id`, `amount`, `status`, `created_by`, payment status). Derive them server-side. Take payment amounts from the server-side price, never from the request.
7. Validate all input with Django forms or DRF serializers. Never build queries by string concatenation.
8. Handle errors on every external call (for example Supabase Storage). Do not swallow exceptions silently. In browser JavaScript `fetch` calls, use `try/catch/finally` so loading states always end and buttons can never get stuck.
9. Supabase exposes tables through its own public Data API. This app only uses Django, so every table in the `public` schema must have Row Level Security (RLS) **enabled with no policies** (this blocks the public API; Django's database connection is not affected). When you add a table, tell the owner to enable RLS on it, and record it in `PROJECT-LOG.md`.
10. Users and members are **never deleted**, only deactivated (`is_active = False`). Payment and attendance history must stay intact for the Financial Dashboard.

## Repo layout
<!-- Assumed monorepo layout. Adjust if yours differs. -->
- `manage.py`, `requirements.txt`, `vercel.json`: backend entry points and deploy config
- `profit/`: Django project (settings, urls, wsgi)
- `apps/membership/`: enrollment (staff-assisted and self-service), attendance, member profiles (Module 1)
- `apps/billing/`: subscriptions, GCash payment claims and their staff review, cash desk payments; approval enrolls the member through the shared membership service (Module 2)
- `apps/finance/`: transaction history and reports (Module 3)
- `apps/accounts/`: users, roles, RBAC permissions
- `api/`: DRF serializers and viewsets for the `web/` pages
- `web/`: static portal pages (HTML/CSS/JS), served by WhiteNoise at the site root
- `templates/`, `static/`: Django-templated pages (HTML templates, plus CSS and JS)
- `supabase/cron/`: `pg_cron` SQL definitions
- `docs/`: Obsidian vault (project notes, one note per decision in `05 - Decisions/`, and the Decision Log index). Open this folder in Obsidian with "Open folder as vault".
- `PROJECT-LOG.md`, `ROADMAP.md`, `Architecture.md`: session log, work checklist, and design plan

## Modules
1. **Membership**: enrollment, attendance records, member profiles. Sign-up is free and starts a 7-day `trial` with app access only (no gym membership, no attendance). Enrollment then happens two ways: staff enroll a member who pays cash at the desk, or a GCash payment claim is approved and the system enrolls the member through the same service. Members use the same portal to view their own profile, attendance, and membership status.
2. **Billing & Subscription**: cash and GCash subscription payments (2.2). A GCash payment is a claim with a reference number and a screenshot link, reviewed by the Owner or Cashier; approval enrolls the member. Cash is recorded by staff at the desk. A `pg_cron` job (2.1) expires memberships automatically. There is no online payment gateway.
3. **Financial Dashboard**: transaction history (3.1) and financial reports (3.2). Owner only.

## Request flow
- Pages call DRF endpoints (`web/` pages) or are rendered by Django views. Neither creates an online checkout: there is no payment gateway.
- Free sign-up flow:
  1. A visitor signs up on the web portal. This creates a user with the Member role and a member profile in `trial` status, which lasts 7 days and gives app access only (no gym membership, no attendance).
  2. The member can pay by GCash or in cash at the desk. Submitting a claim changes nothing about access.
- GCash claim flow:
  1. The member submits the GCash reference number and an https Google Drive link to the transaction screenshot. The claim is stored against the plan's server-side price with status `pending_review`.
  2. The Owner or Cashier opens the claim, checks the screenshot against the reference, then approves or rejects it.
  3. On approval, one database transaction marks the claim `approved` and enrolls the member (status `active`, expiry set) through the shared membership service.
  4. A rejected claim is marked `rejected` and leaves the member exactly as they were. A second approval of the same claim changes nothing.
- Cash flow: staff take the cash at the desk, record the payment as `paid`, and enroll (or renew) the member through the same membership service.
- `pg_cron` updates membership expiry directly in the database and bypasses Django. This is the one exception to "everything goes through the ORM".

## Rules
- Use the Django ORM for all application database access. No raw SQL in app code.
- Keep business logic out of views and serializers where practical; put it in services or models.
- Enrollment logic (creating or activating a membership, setting expiry) lives in one service in `apps/membership/`. Cash payments and GCash claim approval both call it. Do not duplicate it.
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

## Payments (cash and GCash)
- Amounts are in centavos (PHP 100.00 = `10000`).
- Exactly two payment methods: **cash** and **GCash**. There is no PayMongo, no online payment gateway, and no card, bank-transfer, Maya, or wallet option. Do not add one.
- Cash is paid at the desk and recorded by staff (`status = paid`, `recorded_by` set).
- A GCash payment is a **claim**, not a payment: the member submits the GCash reference number and an https Google Drive link to the screenshot of the transaction. It starts as `pending_review` and grants no access.
- The claim amount always comes from the plan price on the server. Never accept an amount from the member's form.
- Accept only `https://drive.google.com/...` or `https://docs.google.com/...` links for the screenshot; store the link and let staff open it. The server never downloads or follows it.
- Only the Owner or Cashier may approve or reject a claim, checked on the server. A member may submit a claim and see their own claims only.
- Submitting a claim never enrolls anyone. Only approval enrolls, and it does so through the shared membership service in `apps/membership/` in one database transaction: mark the claim `approved`, activate the membership, set the expiry.
- Approval must be idempotent. Approving an already-approved claim must not create a second enrollment or extend the expiry twice.
- Rejection sets `rejected`, records the reviewer and the reason, and leaves the member unchanged.
- Old payment rows, including the retired PayMongo history, are never edited or deleted. A mistake is fixed by `voided` plus a reason and a new record.
- Only approved GCash claims and existing `paid` rows count in the Financial Dashboard. `pending_review` and `rejected` claims never count.

## Auth & roles (RBAC)
Roles: Owner, Cashier, Personal Trainer, Member. Enforce permissions server-side on both views and DRF endpoints. There is **one portal and one login**: after logging in, the user's role decides which pages and menu items they get.

| Area | Owner | Cashier | Trainer | Member |
|---|---|---|---|---|
| Financial Dashboard / reports | Yes | No | No | No |
| Record cash payments at the desk | Yes | Yes | No | No |
| Review GCash payment claims (approve or reject) | Yes | Yes | No | No |
| View payment claims | All | All | No | Own only |
| Submit a GCash payment claim | n/a | n/a | n/a | Own only |
| Membership enrollment (cash at desk, or claim approval) | Yes | Yes | No | No |
| Attendance records | Yes | Yes | Yes | View own |
| Own profile | Yes | Yes | Yes | Yes |

Public sign-up may only create the Member role. It must never allow choosing or escalating to Owner, Cashier, or Personal Trainer; the Owner assigns staff roles. A member who has signed up is `trial` for 7 days: app access only, no gym membership and no attendance. Submitting a GCash claim never grants access; only approval or a recorded cash payment enrolls the member.

Every staff-only view and DRF endpoint must check, on the server: the user is logged in, has the correct role, **and is active**. Never assume a layout, menu, or parent template already protected the page. A member may only read and change their own records (always filter by the logged-in user, never by an id from the request alone).

Passwords use Django's password hashers (confirm `PASSWORD_HASHERS` in settings). All traffic must be HTTPS.

## Deployment constraints (Vercel + Supabase)
- Serverless: no background workers, no persistent local filesystem, and function timeouts apply. Use `pg_cron` or webhooks instead of in-process jobs.
- Use the Supabase pooler in transaction mode; set `DISABLE_SERVER_SIDE_CURSORS = True` and keep `CONN_MAX_AGE` low or zero.
- Serve static files via a serverless-compatible approach (for example WhiteNoise). Do not rely on local disk.
- `pg_cron` jobs are not managed by Django migrations. Their SQL lives in `supabase/cron/` and must be applied manually or via a documented script. Write the SQL file, then tell the owner exactly where to paste it in the Supabase dashboard. Never apply it yourself.
- Never run `vercel` deploy commands or change Vercel/Supabase dashboard settings. Tell the owner what to change and why.

## Environment variables (names only)
`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`