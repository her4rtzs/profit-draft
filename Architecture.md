# ProFit — Architecture (Master System Plan)

Source of truth for *what the system must do*. Where the team deliberately differs from an earlier plan, it is listed under **Approved deviations** at the bottom — follow the deviation, not the older text. Day-to-day rules for AI agents live in `AGENTS.md`; the checklist of work lives in `ROADMAP.md`; this file explains the design and the checks each phase must pass.

## 1. Stack and storage

- **Web portal (staff and members), static pages (`web/`):** HTML, CSS and JavaScript, served by WhiteNoise at the site root; they call the Django API from the browser. Font Awesome and Google Fonts load from a CDN. Phone-first and responsive.
- **Web portal, Django pages (`templates/`, `static/`):** HTML, CSS and JavaScript served through Django templates.
- **One portal for everyone:** staff and members use the same site and the same login. The user's role decides which pages and menu items they get.
- **Installable on phones:** the portal can be added to a phone's home screen (see `ROADMAP.md` Phase 4.5). There is no native mobile app, no app store, and no push notifications or offline mode.
- **Backend:** Django + Django REST Framework (the JSON API used by the `web/` pages), deployed as serverless functions on Vercel (free tier).
- **Database:** Supabase PostgreSQL, accessed only through the Django ORM. Row Level Security (RLS) is enabled on every table with no policies, so Supabase's own public API is closed.
- **Files:** Supabase Storage through `django-storages` (profile images, generated PDFs). Profile images are checked on upload: reject files larger than 2 MB, accept only `.jpeg`, `.png`, `.webp`; keep stored images small.
- **Payments:** **cash and GCash only**, with no online payment gateway. Cash is recorded by staff at the desk. A GCash payment is a claim: the member submits the GCash reference number and an https Google Drive link to the screenshot; only an Owner or Cashier approval enrolls the member. PayMongo, cards, Maya, bank transfer, and wallet options are removed.
- **Scheduled jobs:** Supabase `pg_cron` (membership expiry). SQL lives in `supabase/cron/` and is applied by the owner, not by Django migrations.
- **Environment separation:** two Supabase projects, **Dev** and **Prod**. Local `.env` points to Dev. Secrets live only in server-side environment variables (Vercel dashboard for Prod).
- **Timezone and currency:** `Asia/Manila`, PHP. Amounts are stored in **centavos** (PHP 100.00 = `10000`) and formatted as `₱1,500.00` on screen.

## 2. Roles (RBAC)

| Role | Who | Can do |
|---|---|---|
| **Owner** | Gym owner | Everything: financial dashboard, reports, staff accounts, all staff features, review GCash payment claims |
| **Cashier** | Front desk | Enroll members who pay cash, record cash payments, review GCash payment claims, record and view attendance |
| **Personal Trainer** | Coach | Record and view attendance, view member profiles |
| **Member** | Gym customer | View and update own profile, view own attendance and membership status, submit and view own GCash payment claims |

- **Public sign-up creates the Member role only.** Staff roles are assigned by the Owner; nobody can choose or escalate their own role.
- A member who signs up is `trial` for 7 days: app access only, no gym membership and no attendance. A GCash claim starts `pending_review` and grants nothing until approved.
- Only the Owner or Cashier may approve or reject a GCash claim. A Member sees only their own claims.
- Permissions are enforced on the server in every view and every API endpoint. Hiding a button is only UX.
- A Member can only ever read or change their own records. Queries are filtered by the logged-in user, never by an id taken from the request alone.

## 3. User lifecycle

- **Members:** sign up free on the web portal → `trial` profile for 7 days, app access only → pay by GCash claim (approved by the Owner or Cashier) or cash at the desk → enrolled (`active`). Staff can also enroll a walk-in directly with a cash payment.
- **Staff:** accounts are created by the Owner, who assigns the role. There is no public path to a staff role.
- **Offboarding:** users and members are **never deleted**, only deactivated (`is_active = False`). This protects payment history and attendance records used by the Financial Dashboard. A deactivated user is locked out; reactivating is the same toggle in reverse.

## 4. Modules and navigation

- **Module 1 — Membership:** enrollment (staff-assisted with cash, or on GCash claim approval), attendance, member profiles. Free sign-up gives a 7-day `trial` with app access only.
  - *Staff menu:* Members, Enroll Member, Attendance.
  - *Member menu:* My Profile, My Attendance, Membership/Payment.
- **Module 2 — Billing & Subscription:** GCash payment claims and their staff review, cash desk payments, and the automatic expiry job. There is no online checkout.
  - *Staff menu:* Record Cash Payment, Payment Claims. *Member menu:* Pay / Renew.
- **Module 3 — Financial Dashboard (Owner only):** transaction history and financial reports.
  - *Owner menu:* Dashboard, Transactions, Reports, Staff Accounts.
- Menus show only what the role can use, but every page and action is also checked on the server (see Section 2).

## 5. Data model overview

A short map only. Exact columns, constraints, and RLS notes go in `docs/DATABASE.md` when the database phase starts. Every table gets `created_at`; money columns are integers in centavos.

| Table | Purpose | Key points |
|---|---|---|
| `users` (profile) | Login accounts | `role` (Owner/Cashier/Trainer/Member), `is_active` |
| `members` | Gym member profile | one per Member user (or staff-created walk-in), `status`: `trial` / `active` / `expired` |
| `plans` | What can be bought | `name`, `price_centavos`, `duration_days` (a daily pass is `1`, a monthly plan is `30`) |
| `memberships` | A member's paid period | `member`, `plan`, `starts_on`, `expires_on` |
| `payments` | Every payment and GCash claim | `member`, `plan`, `amount_centavos`, `method` (`cash` or `gcash`), `status` (`pending_review` / `approved` / `rejected` for GCash claims; `paid` / `voided` for cash; legacy `pending` / `failed` rows kept), `gcash_reference`, `proof_url` (Drive link), `reviewed_by`, `reviewed_at`, `rejection_reason`, `recorded_by` (staff, for cash) |
| `webhook_events` | Retired PayMongo events | Kept read-only as history; no new rows after PayMongo removal |
| `attendance` | Gym check-ins | `member`, `checked_in_at`, `recorded_by` |

Rules for this data:
- Prices are always read from `plans` on the server. A client-sent amount is never trusted.
- A GCash claim is a `payments` row in `pending_review`; submitting it grants no access. Only approval activates a membership.
- **Payments are never edited or deleted.** A mistake is fixed by marking it `voided` with a reason and recording a new payment, so the financial history always adds up.
- Financial reports read only from `payments`, counting `paid` cash rows and `approved` GCash claims, so there is one source of truth for money.

## 6. Membership engine

- **Status values:** `trial` (signed up free, 7 days, app access only, no gym membership or attendance) → `active` (paid, before expiry) → `expired` (past expiry). Renewing an expired or active member extends or restarts the expiry from the new payment.
- **One enrollment service** in `apps/membership/` creates or activates a membership and sets the expiry. Cash desk payments and GCash claim approval both call it. It is never duplicated; approval runs it in one transaction with marking the claim approved.
- **Expiry is double-checked:** the nightly `pg_cron` job marks memberships `expired`, **and** the app also compares `expires_on` to today when deciding access. If the job ever fails, nobody gets free access.
- **Attendance:** staff record a check-in for a member. Only `active` members can be checked in; `trial` and `expired` members get a clear message and a prompt to pay or renew. A member is checked in at most once per day (Manila date).
- **Member profile:** name, contact details, photo, plan, expiry date, status. Members edit only their own contact details and photo.

## 7. Payments, trial, and enrollment

Three entry points, one enrollment service:

1. **Free sign-up (trial).** A visitor signs up → a Member user and a member profile in `trial` status, lasting 7 days. The trial gives app access only: the member can log in and see their profile and payment pages. It is not a gym membership: no attendance, no check-in.
2. **GCash claim.** The member picks a plan and submits:
   - the GCash reference number;
   - an https Google Drive link to the screenshot of the transaction.
   The server stores the claim against the plan's price (never the member's number) with status `pending_review`. The member can see their own claims and their status.
3. **Cash at the desk.** Staff take the cash, record the payment as `paid` with `recorded_by`, and enroll or renew through the service.

Review:
- Only the Owner or Cashier sees the review queue and can approve or reject a claim.
- **Approval**, in one database transaction: marks the claim `approved`, then calls the one enrollment service to activate the membership and set the expiry. One transaction means a failure leaves neither half done.
- Approving an already-approved claim does nothing (idempotent). No second enrollment, no second expiry extension.
- **Rejection** marks the claim `rejected` with the reviewer and a reason. The member stays `trial` or `expired`; nothing else changes.
- Submitting a claim never grants access. Nobody is enrolled because a page or a screenshot says the payment succeeded.

Safety rules:
- The amount always comes from the server-side plan price; the claim form has no amount field.
- The Google Drive link is validated as an https `drive.google.com` or `docs.google.com` URL and stored as text. The server never fetches it; staff open it in the browser to check the screenshot against the reference.
- Old payment rows, including the retired PayMongo history, are never edited or deleted. A mistake is fixed by `voided` plus a reason.
- A member can only read their own claims; the query filters by the logged-in user, never by an id in the request.

## 8. Financial dashboard and reports (Owner only)

- **Dashboard:** today's income, this week, this month, active member count, memberships expiring soon, split by payment method (cash and GCash).
- **Transaction history:** searchable, filterable by date range, method, status, and member; shows who recorded desk payments.
- **Reports:** income by day, week, and month for a chosen date range; printable page (the browser's "Print → Save as PDF" is enough to start).
- Cashiers and Trainers never see totals or reports; this is checked on the server, not only hidden in the menu.
- Every number comes from `payments` rows; the page never stores its own totals. Only `paid` cash rows and `approved` GCash claims count; `pending_review` and `rejected` claims are excluded, and old PayMongo rows stay exactly as they were.

## 9. Notifications

- Out of scope for now: no email, SMS, push, or chat notifications.
- Members see their status on screen in the portal (a banner: trial, active until a date, or expired) whenever they log in.
- Email or SMS reminders before expiry may be added later as a new phase.

## 10. UI/UX

- Clear, simple, readable on a phone: gym staff use the portal standing at the front desk, and members use it on their own phones.
- Colors, spacing, and font sizes are defined once as CSS variables; shared layout and partials (navbar, sidebar, forms, tables).
- Status badges: `trial` (grey), `active` (green), `expired` (red).
- Every list has an empty state, and every action shows loading, success, and error states.
- Forms: labels on every field, CSRF protection on every POST, keyboard-usable.
- Language is plain and short; amounts always show the `₱` sign.

## 11. Security, backup, and recovery

- RLS enabled (no policies) on every table in the `public` schema; Django's connection is not affected.
- Server-side permission check on every view and endpoint: logged in, correct role, **and active**.
- Never log personal details or payment details. Never commit secrets or read `.env` files.
- HTTPS only; passwords use Django's password hashers.
- **Backup:** Supabase's free tier has no automated backups. The owner exports the database weekly from the Supabase dashboard; recovery means re-importing the latest export. Documented in `docs/BACKUP.md` (written in the last phase, and the export must be run once to prove it works).

## 12. Phased build plan

| Phase | Focus | Status |
|---|---|---|
| 0 | Foundation: repo, Django project, Dev/Prod Supabase, Vercel deploy, base layout | **Done** (`ROADMAP.md` Phase 0) |
| 1 | Database and security: tables, RLS, plans, seed data | **Partly done:** the tables exist as tracked migrations, but RLS is not applied, `plans` is a choice field on the subscription rather than a table, and there is no seed data |
| 2 | Accounts and roles: login, member sign-up, staff accounts, RBAC, deactivation | **Done, one gap** (`ROADMAP.md` Phase 1): login rate limiting is still missing |
| 3 | Membership (Module 1): profiles, staff-assisted enrollment, attendance, member pages for own profile and attendance | **Done, one deviation** (`ROADMAP.md` Phase 2): the member photo is a data URL in the database, not Supabase Storage |
| 4 | Billing (Module 2): PayMongo checkout, webhook, self-enrollment, desk payments, expiry job | **Done, with deviations** (`ROADMAP.md` Phase 3): PayMongo Checkout Sessions rather than payment intents, and the `pg_cron` SQL is written but not applied |
| 4.6 | Free trial and GCash claim review: remove PayMongo, 7-day trial, staff-approved GCash claims | **In progress** (`ROADMAP.md` Phase 4.6): PayMongo removed, trial and claim flows built; gate checks pending |
| 5 | Financial Dashboard (Module 3): transactions, reports | **In progress** (`ROADMAP.md` Phase 4): no server-side PDF in Supabase Storage and no status reconciliation view |
| 6 | Hardening and handover: full permission review, backup run, owner guide | **Not started** (`ROADMAP.md` Phase 6) |

`ROADMAP.md` carries the detailed checklist and numbers the phases differently, and this table's Phase 1 (database and security) is spread across its earlier phases. Because the native mobile app was dropped, the member-mobile-app phase in `ROADMAP.md` is marked removed, the member web pages and the installable-app step are tracked in Phase 4.5, and the leftover `mobile/` skeleton has been deleted from the repo.

**Phase 0 gate checks:** the site loads on its Vercel URL; local runs against Dev, and the live site runs against Prod; static files and the base layout load with no errors; `ruff check .` and `python manage.py test` pass.
**Phase 1 gate checks:** all tables exist as tracked migrations; RLS is enabled on every table (the Supabase public API returns nothing); a plan's price can only come from `plans`.
**Phase 2 gate checks:** public sign-up can only create a Member; a Member cannot open a staff or Owner URL or call a staff API endpoint (blocked on the server, not only hidden); a deactivated user cannot log in; the Owner can create a staff account with a role.
**Phase 3 gate checks:** a Cashier can enroll a walk-in member; a Member sees only their own profile and attendance; a `pending` or `expired` member cannot be checked in; a second check-in on the same day is refused.
**Phase 4 gate checks:** a test PayMongo payment in Dev turns a `pending` member `active` with the right expiry and no staff step; sending the same webhook twice changes nothing the second time; a webhook with a bad signature is rejected; closing the checkout tab does not enroll anyone; the expiry job marks an overdue membership `expired`, and access is still blocked if the job is skipped.
**Phase 4.6 gate checks:** free sign-up creates a `trial` member with no attendance; a submitted GCash claim grants no access and is visible only to its owner and to staff; a Cashier approval makes the member `active` exactly once and a repeat approval changes nothing; a rejected claim changes nothing; a client-sent amount is ignored in favour of the plan price; the dashboard counts the approved payment once and no PayMongo keys remain.
**Phase 5 gate checks:** the Owner sees correct totals that match the `payments` table; a Cashier and a Member are blocked from the dashboard and reports by the server; date filters give correct results across midnight Manila time.
**Phase 6 gate checks:** every view has been checked for login, role, and active status; the weekly backup export has been run once and the file opens; the Owner has a short written guide for daily use.

## 13. Approved deviations

- **No native mobile app:** members and staff use one web portal that can be installed on a phone's home screen. Push notifications, camera features, and offline mode are not available and not needed for this project.
- **PayMongo removed; cash and GCash only:** the payment gateway and its webhook are gone. A GCash payment is a claim with a reference number and a screenshot link, approved by the Owner or Cashier; approval enrolls the member in one transaction. Cash is recorded at the desk. No live keys, cards, Maya, or wallet options exist.
- *(Add new entries here whenever the team knowingly changes the plan.)*

## 14. Open decisions (owner to confirm)

These are assumptions made while writing this plan. Change this file if any are wrong.
1. **Plans:** a plan is defined by a price and a number of days (daily pass = 1 day, monthly = 30 days). Which plans does the gym actually sell, and at what prices?
2. **Is there a one-time enrollment fee** in addition to the subscription, or is the first subscription payment all?
3. **Who may deactivate members** — only the Owner, or Cashiers too?
4. **Attendance:** is staff check-in at the front desk enough, or should members check themselves in (for example by showing a QR code)?
5. **Reports:** is printing to PDF from the browser enough, or does the owner need a downloadable PDF/Excel file?
6. **Installing on phones:** members add the site to their home screen from the browser. Is that acceptable instead of an app store listing?
7. **End of trial:** when the 7 days end with no approved payment, does the member keep app access to submit a claim, or does the account fall back to `expired` with no access? Confirm.