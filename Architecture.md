# ProFit — Architecture (Master System Plan)

Source of truth for *what the system must do*. Where the team deliberately differs from an earlier plan, it is listed under **Approved deviations** at the bottom — follow the deviation, not the older text. Day-to-day rules for AI agents live in `AGENTS.md`; the checklist of work lives in `ROADMAP.md`; this file explains the design and the checks each phase must pass.

## 1. Stack and storage

- **Web portal (staff), static pages (`web/`):** plain HTML, CSS and vanilla JavaScript, no framework and no build step, served by WhiteNoise at the site root; they call the Django API from the browser. Responsive, so it also works on a phone browser.
- **Web portal (staff), Django pages (`templates/`, `components/`, `static/`):** Django templates with Tailwind CSS, daisyUI, HTMX, Alpine.js, Lucide Icons and django-components.
- **Mobile app (members):** React Native with NativeWind, react-native-reusables, and lucide-react-native. It talks only to the Django API (Django REST Framework), never directly to Supabase or PayMongo secrets.
- **Backend:** Django + Django REST Framework, deployed as serverless functions on Vercel (free tier). Web pages use Django views; the mobile app uses DRF endpoints.
- **Database:** Supabase PostgreSQL, accessed only through the Django ORM. Row Level Security (RLS) is enabled on every table with no policies, so Supabase's own public API is closed.
- **Files:** Supabase Storage through `django-storages` (profile images, generated PDFs). Profile images are checked on upload: reject files larger than 2 MB, accept only `.jpeg`, `.png`, `.webp`; keep stored images small.
- **Payments:** PayMongo on a **test-mode account** (no live keys, no real money). The methods offered are read from one setting, `PAYMONGO_PAYMENT_METHODS`, currently `gcash`, `paymaya`, `card` and `qrph`, so turning a method on or off is configuration, not code. Cash, GCash and bank payments taken at the desk are recorded by staff and never go through PayMongo.
- **Scheduled jobs:** Supabase `pg_cron` (membership expiry). SQL lives in `supabase/cron/` and is applied by the owner, not by Django migrations.
- **Environment separation:** two Supabase projects, **Dev** and **Prod**. Local `.env` points to Dev; PayMongo runs on **test keys in both Dev and Prod** and live keys are never added. Secrets live only in server-side environment variables (Vercel dashboard for Prod).
- **Timezone and currency:** `Asia/Manila`, PHP. Amounts are stored in **centavos** (PHP 100.00 = `10000`) and formatted as `₱1,500.00` on screen.

## 2. Roles (RBAC)

| Role | Who | Can do |
|---|---|---|
| **Owner** | Gym owner | Everything: financial dashboard, reports, staff accounts, all staff features |
| **Cashier** | Front desk | Enroll members (staff-assisted), record payments, record and view attendance |
| **Personal Trainer** | Coach | Record and view attendance, view member profiles |
| **Member** | Gym customer | In the mobile app: view and update own profile, view own attendance and membership status, pay own subscription |

- **Public sign-up creates the Member role only.** Staff roles are assigned by the Owner; nobody can choose or escalate their own role.
- A member who signed up but has not paid is `pending`: no attendance or subscription features until enrolled.
- Permissions are enforced on the server in every view and every API endpoint. Hiding a button is only UX.
- A Member can only ever read or change their own records. Queries are filtered by the logged-in user, never by an id taken from the request alone.

## 3. User lifecycle

- **Members:** sign up on web or mobile → `pending` profile → pay → webhook enrolls them (`active`). Or staff enroll them in person (walk-ins, cash).
- **Staff:** accounts are created by the Owner, who assigns the role. There is no public path to a staff role.
- **Offboarding:** users and members are **never deleted**, only deactivated (`is_active = False`). This protects payment history and attendance records used by the Financial Dashboard. A deactivated user is locked out; reactivating is the same toggle in reverse.

## 4. Modules and navigation

- **Module 1 — Membership:** enrollment (staff-assisted and self-service), attendance, member profiles.
  - *Staff nav (web):* Members, Enroll Member, Attendance.
  - *Member screens (mobile):* My Profile, My Attendance, Membership/Payment.
- **Module 2 — Billing & Subscription:** subscription payments through PayMongo (including the first payment that triggers self-enrollment), staff-recorded cash payments, and the automatic expiry job.
  - *Staff nav (web):* Record Payment. *Member screens (mobile):* Pay / Renew.
- **Module 3 — Financial Dashboard (Owner only):** transaction history and financial reports.
  - *Owner nav:* Dashboard, Transactions, Reports, Staff Accounts.
- Navigation shows only what the role can use, but every page and action is also checked on the server (see Section 2).

## 5. Data model overview

A short map only. Exact columns, constraints, and RLS notes go in `docs/DATABASE.md` when the database phase starts. Every table gets `created_at`; money columns are integers in centavos.

| Table | Purpose | Key points |
|---|---|---|
| `users` (profile) | Login accounts | `role` (Owner/Cashier/Trainer/Member), `is_active` |
| `members` | Gym member profile | one per Member user (or staff-created walk-in), `status`: `pending` / `active` / `expired` |
| `plans` | What can be bought | `name`, `price_centavos`, `duration_days` (a daily pass is `1`, a monthly plan is `30`) |
| `memberships` | A member's paid period | `member`, `plan`, `starts_on`, `expires_on` |
| `payments` | Every payment attempt | `member`, `plan`, `amount_centavos`, `method` (`qrph` / `cash`), `status` (`pending` / `paid` / `failed` / `voided`), `paymongo_intent_id`, `recorded_by` (staff, for cash) |
| `webhook_events` | PayMongo events already handled | unique event id, so a repeated delivery is ignored |
| `attendance` | Gym check-ins | `member`, `checked_in_at`, `recorded_by` |

Rules for this data:
- Prices are always read from `plans` on the server. A client-sent amount is never trusted.
- **Payments are never edited or deleted.** A mistake is fixed by marking it `voided` with a reason and recording a new payment, so the financial history always adds up.
- Financial reports read only from `payments` (`status = paid`), so there is one source of truth for money.

## 6. Membership engine

- **Status values:** `pending` (signed up, not paid) → `active` (paid, before expiry) → `expired` (past expiry). Renewing an expired or active member extends or restarts the expiry from the new payment.
- **One enrollment service** in `apps/membership/` creates or activates a membership and sets the expiry. The webhook handler and staff enrollment both call it. It is never duplicated.
- **Expiry is double-checked:** the nightly `pg_cron` job marks memberships `expired`, **and** the app also compares `expires_on` to today when deciding access. If the job ever fails, nobody gets free access.
- **Attendance:** staff record a check-in for a member. Only `active` members can be checked in; `pending` and `expired` members get a clear message and a prompt to pay or renew. A member is checked in at most once per day (Manila date).
- **Member profile:** name, contact details, photo, plan, expiry date, status. Members edit only their own contact details and photo.

## 7. Payments and self-enrollment

1. A visitor signs up on web or mobile → a Member user and a `pending` member profile are created.
2. The server creates a PayMongo payment intent using the plan's price and one of the enabled methods, and stores the intent on a `pending` payment row.
3. The member pays by QR Ph (in test mode, using PayMongo's test payment flow).
4. PayMongo calls the **webhook** (a Django view). The handler:
   - verifies the signature first;
   - skips the event if it is already in `webhook_events`;
   - matches the event to the stored intent (never trusting member ids in the event metadata alone);
   - **in one database transaction** marks the payment `paid`, enrolls the member (`active`), and sets the expiry.
5. Failed or abandoned payments leave the member `pending`.

Safety rules:
- Only the webhook sets a payment to paid or failed, and only the webhook triggers self-enrollment. The redirect or app screen after paying is only a "we're checking your payment" message.
- A duplicate webhook delivery must not create a second enrollment or extend the expiry twice.
- **Cash and walk-ins:** staff record the payment and enroll the member through the same enrollment service. The payment is saved as `paid` with `recorded_by` set to the staff member.
- Web and mobile checkout show only the methods in `PAYMONGO_PAYMENT_METHODS`.

## 8. Financial dashboard and reports (Owner only)

- **Dashboard:** today's income, this week, this month, active member count, memberships expiring soon, split by payment method (QR Ph, Cash).
- **Transaction history:** searchable, filterable by date range, method, status, and member; shows who recorded cash payments.
- **Reports:** income by day, week, and month for a chosen date range; printable page (the browser's "Print → Save as PDF" is enough to start).
- Cashiers and Trainers never see totals or reports; this is checked on the server, not only hidden in the menu.
- Every number comes from `payments` rows; the page never stores its own totals.

## 9. Notifications

- Out of scope for now: no email, SMS, or chat notifications.
- Members see their status on screen in the mobile app (a banner: pending, active until a date, or expired) whenever they open it.
- Email or SMS reminders before expiry may be added later as a new phase.

## 10. UI/UX

- Clear, simple, readable on a phone: gym staff will use the web portal standing at the front desk, and members use the mobile app.
- **Web:** colors, spacing, and font sizes are defined once as CSS variables; one base layout with shared partials (navbar, sidebar, forms, tables).
- **Mobile:** NativeWind classes and react-native-reusables components; one shared theme.
- Status badges: `pending` (grey), `active` (green), `expired` (red).
- Every list has an empty state, and every action shows loading, success, and error states.
- Forms: labels on every field, CSRF protection on every POST, keyboard-usable.
- Language is plain and short; amounts always show the `₱` sign.

## 11. Security, backup, and recovery

- RLS enabled (no policies) on every table in the `public` schema; Django's connection is not affected.
- Server-side permission check on every view: logged in, correct role, **and active**.
- Never log personal details or payment details. Never commit secrets or read `.env` files.
- HTTPS only; passwords use Django's password hashers.
- **Backup:** Supabase's free tier has no automated backups. The owner exports the database weekly from the Supabase dashboard; recovery means re-importing the latest export. Documented in `docs/BACKUP.md` (written in the last phase, and the export must be run once to prove it works).

## 12. Phased build plan

| Phase | Focus | Status |
|---|---|---|
| 0 | Foundation: repo, Django project, Dev/Prod Supabase, Vercel deploy, base layout | **Done** (`ROADMAP.md` Phase 0) |
| 1 | Database and security: tables, RLS, plans, seed data | **Partly done:** the tables exist as tracked migrations, but RLS is not applied, `plans` is a choice field on the subscription rather than a table, and there is no seed data |
| 2 | Accounts and roles: login (web and mobile API), member sign-up, staff accounts, RBAC, deactivation | **Done, one gap** (`ROADMAP.md` Phase 1): login rate limiting is still missing |
| 3 | Membership (Module 1): profiles, staff-assisted enrollment, attendance, member API and mobile profile/attendance screens | **Done, one deviation** (`ROADMAP.md` Phase 2): the member photo is a data URL in the database, not Supabase Storage, and the mobile screens are still the `mobile/` skeleton |
| 4 | Billing (Module 2): PayMongo checkout (web and mobile), webhook, self-enrollment, cash payments, expiry job | **Done, with deviations** (`ROADMAP.md` Phase 3): PayMongo Checkout Sessions rather than payment intents, and the `pg_cron` SQL is written but not applied |
| 5 | Financial Dashboard (Module 3): transactions, reports | **In progress** (`ROADMAP.md` Phase 4): no server-side PDF in Supabase Storage and no status reconciliation view |
| 6 | Hardening and handover: full permission review, backup run, owner guide | **Not started** (`ROADMAP.md` Phase 6) |

`ROADMAP.md` carries the detailed checklist and splits the work further: the member mobile app and the after-launch work are separate phases there, and this table's Phase 1 (database and security) is spread across its earlier phases.

**Phase 0 gate checks:** the site loads on its Vercel URL; local runs against Dev, and the live site runs against Prod; static files and the base layout load with no errors; `ruff check .` and `python manage.py test` pass.
**Phase 1 gate checks:** all tables exist as tracked migrations; RLS is enabled on every table (the Supabase public API returns nothing); a plan's price can only come from `plans`.
**Phase 2 gate checks:** public sign-up can only create a Member; a Member cannot open a staff or Owner URL or call a staff API endpoint (blocked on the server, not only hidden); a deactivated user cannot log in; the Owner can create a staff account with a role.
**Phase 3 gate checks:** a Cashier can enroll a walk-in member; a Member sees only their own profile and attendance, in the mobile app and through the API; a `pending` or `expired` member cannot be checked in; a second check-in on the same day is refused.
**Phase 4 gate checks:** a test PayMongo payment in Dev turns a `pending` member `active` with the right expiry and no staff step; sending the same webhook twice changes nothing the second time; a webhook with a bad signature is rejected; closing the checkout tab or the app does not enroll anyone; the expiry job marks an overdue membership `expired`, and access is still blocked if the job is skipped.
**Phase 5 gate checks:** the Owner sees correct totals that match the `payments` table; a Cashier and a Member are blocked from the dashboard and reports by the server; date filters give correct results across midnight Manila time.
**Phase 6 gate checks:** every view has been checked for login, role, and active status; the weekly backup export has been run once and the file opens; the Owner has a short written guide for daily use.

## 13. Approved deviations

- **PayMongo in test mode:** the account is in test mode, so no live keys exist and no real money moves. The methods offered are configuration, not code (`PAYMONGO_PAYMENT_METHODS`, currently `gcash`, `paymaya`, `card` and `qrph`).
- *(Add new entries here whenever the team knowingly changes the plan.)*

## 14. Open decisions (owner to confirm)

These are assumptions made while writing this plan. Change this file if any are wrong.
1. **Plans:** a plan is defined by a price and a number of days (daily pass = 1 day, monthly = 30 days). Which plans does the gym actually sell, and at what prices?
2. **Is there a one-time enrollment fee** in addition to the subscription, or is the first subscription payment all?
3. **Who may deactivate members** — only the Owner, or Cashiers too?
4. **Attendance:** is staff check-in at the front desk enough, or should members check themselves in (for example by showing a QR code)?
5. **Reports:** is printing to PDF from the browser enough, or does the owner need a downloadable PDF/Excel file?
6. **Mobile app:** how will members install it (Expo Go for testing, a downloaded APK, or the Play Store / App Store later), and is it Android-only at first?