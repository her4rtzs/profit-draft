# ProFit Roadmap

Phases are ordered by dependency, not by date. Each phase has an exit check: do not start the next phase until it passes. Check items off as they are completed.

`AGENTS.md` is the source of truth for the stack, the rules, the RBAC matrix, the payment rules and the repo layout. This file is only the delivery order: when the two disagree, `AGENTS.md` wins and this file is corrected. Session history lives in `PROJECT-LOG.md`; the diagram lives in `Architecture.md`.

Convention: `[x]` means verified against the code, `[ ]` means not done. Where part of an item already exists, a note says what is there.

Last reviewed: 2026-10-18, on the single root tree after the duplicate `ProFit-combined/` copy was merged into it and removed (code reading, every item checked against `AGENTS.md`; no runtime test run, Django was not installed in the review environment).

## Current status

**The system is at Phase 4 (Financial Dashboard), in progress. Phases 0 to 3 have passed their exit checks, Phase 4 has not.**

| Phase | State | What is actually there |
|---|---|---|
| 0 Foundation | Pass | Scaffold, env-driven settings, SQLite offline fallback, `vercel.json`, WhiteNoise, build-time Tailwind + daisyUI, django-components, `Asia/Manila` + PHP. Gap: `ruff` is run ad hoc, it is not in `requirements.txt` and there is no CI. |
| 1 Accounts & RBAC | Pass | Custom `accounts.User` + `Role` (Owner/Cashier/Trainer/Member), session login/logout for the portal and DRF, single-sourced RBAC in `apps/accounts/permissions.py` enforced on both view and DRF adapters, matrix tests in `apps/accounts/tests/test_permissions.py`. Extra: email-OTP signup, Owner staff invites, change-password, and forgot/reset password (email code, `web/forgot.html`). Still missing: login rate limiting. |
| 2 Membership Management | Pass, with one deviation | `MemberProfile`/`Enrollment`/`Attendance`, `enroll_member`/`renew_member`/`check_in_member` in `apps/membership/services.py`, staff-assisted enrollment, attendance history, `PENDING` vs `ACTIVE`. Deviation: the member photo is a base64 data URL in `MemberProfile.photo_data`, not Supabase Storage. |
| 3 Billing & Subscription | Pass, with deviations | PayMongo Checkout Sessions, webhook with signature verification + idempotent handling + race handling (`apps/billing/webhooks.py`), self-enrollment in one transaction (`complete_signup`), pay-first join, failed/abandoned payments stay pending, desk cash/GCash/bank payments (`finance.ManualPayment`), webhook/checkout tests. Deviations: see Conformance with AGENTS.md. |
| 4 Financial Dashboard | **In progress** | Owner-only gate, transaction list with search/member/method filters, monthly totals (`monthly_summary`), client-side CSV and print-to-PDF export. Missing: server-side PDF stored in Supabase Storage, status reconciliation view, and a status filter over paid/pending/failed. |
| 5 Member Mobile App | Not started | `mobile/` is the Expo skeleton from the scaffold: one `MembershipScreen`, no auth, no payment flow, `npm test` is a stub. |
| 6 Hardening & Launch | Not started | No security review, no load testing, no member import, no staff guide, no monitoring. |
| 7 After Launch | Not started | No PayMongo business registration, no extra methods, `Architecture.md` not updated for the shipped methods. |

## Built outside this roadmap

These exist in the code but are not in the phases below and are not sanctioned by `AGENTS.md`, which describes three modules and a staff-only web portal. Each needs a phase of its own plus a line in `AGENTS.md`, or removal:

- Announcements (staff publish, member read) — `apps/announcements/`
- Notifications (server-backed bell, read state) — `apps/notifications/`
- Trainers: assignment and member requests — `apps/trainers/`
- Staff portal pages: attendance, payments, reports, members, settings, profile, change-password, trainer portal
- Member portal and pay-first join (`web/join.html`, `billing.PendingSignup`)
- PWA shell (`web/sw.js`, `web/manifest.webmanifest`) and the portal UX/theme work (the "phase 10/11" bundles in `CHANGES-phase11.md`)
- Landing page, FAQ, Terms, Privacy and the shared footer

## Phase 0: Foundation

Goal: an empty but deployable skeleton.

- [x] Repo scaffold matching the layout in `AGENTS.md` (`profit/`, `apps/`, `api/`, `components/`, `mobile/`, `supabase/cron/`). Note: `docs/` from the `AGENTS.md` layout does not exist yet; the docs live at the repo root.
- [x] Django project connected to Supabase PostgreSQL through the transaction-mode pooler (`DISABLE_SERVER_SIDE_CURSORS = True`, `CONN_MAX_AGE = 0`)
- [x] Vercel deployment with `vercel.json`, WhiteNoise static files, and env vars set
- [x] Tailwind + daisyUI compiled at build time; django-components, HTMX, Alpine.js, Lucide wired into a base template
- [ ] Lint (`ruff`) and test commands running, ideally in CI. `ruff` is not in `requirements.txt` and there is no `.github/`, so nothing runs them automatically.
- [x] `Asia/Manila` timezone and PHP currency configured

Exit check: a "hello" page deploys to Vercel, reads from Supabase, and renders with Tailwind/daisyUI styles.

## Phase 1: Accounts & RBAC

Goal: secure login and the permission model everything else relies on.

- [x] Custom user model and roles: Owner, Cashier, Personal Trainer, Member
- [x] Login/logout for the staff portal; token or session auth for the DRF mobile API (session auth in `api/auth.py`)
- [x] Permission checks enforced server-side on views and DRF endpoints, following the RBAC matrix in `AGENTS.md`
- [x] Public sign-up creates the Member role only; Owner assigns staff roles
- [x] Tests for every role/area combination in the matrix

Exit check: each role can reach only what the matrix allows, verified by tests.

## Phase 2: Membership Management (Module 1)

Goal: staff can run the front desk without paper logbooks.

- [ ] Member profiles (including profile image via Supabase Storage). Profiles exist; the image is stored as a data URL in `MemberProfile.photo_data` instead of Supabase Storage.
- [x] Single enrollment service in `apps/membership/` (create/activate membership, set expiry)
- [x] Staff-assisted enrollment for walk-ins and cash, using that service
- [x] Attendance recording (Owner, Cashier, Trainer) and attendance history
- [x] `pending` vs `active` member status enforced (pending members have no member-level access)

Exit check: staff can enroll a walk-in member and record their attendance end to end.

## Phase 3: Billing & Subscription (Module 2)

Goal: members can pay online and be enrolled automatically.

- [ ] PayMongo integration limited to the methods `AGENTS.md` names (GCash, Maya, cards), read from one configured list so enabling or disabling a method is a settings change, not a code change. Shipped as `PAYMONGO_PAYMENT_METHODS` in `profit/settings.py`; its default also enables QR Ph, which is acceptable only while the launch subset stays a setting. PayMongo Wallet is not in `AGENTS.md`, so it is dropped.
- [x] Payment creation from both web views and DRF endpoints (`/api/join/checkout/`, `/api/member/checkout/`, Checkout Sessions)
- [x] Webhook receiver: signature verification, idempotent handling, intent matching against server-side records
- [x] Self-enrollment: on a paid event, one transaction marks the payment paid, activates the member, and sets expiry (calls the shared enrollment service)
- [x] Failed or abandoned payments leave the member `pending`
- [x] Staff cash payment recording (desk payments in `finance.ManualPayment`, with the membership renewed in the same transaction)
- [ ] `pg_cron` expiry job in `supabase/cron/` (Sub-Module 2.1), with a documented way to apply it. The SQL is written and documented in `supabase/cron/membership_expiry.sql`, but it is commented out and there is no record that it was applied to the Supabase database.
- [x] Tests: duplicate webhook delivery, invalid signature, mismatched metadata, failed payment

Exit check: a test sign-up and payment results in exactly one active enrollment, and a duplicate webhook changes nothing.

## Phase 4: Financial Dashboard (Module 3)

Goal: the Owner sees finances in the system instead of group chats.

- [ ] Transaction history with filters (date, member, payment method, status). Search, member and method filters exist; there is no date range and no status filter.
- [ ] Financial report generation (daily/monthly totals), with PDF export stored via Supabase Storage. Monthly totals exist (`monthly_summary`, `/api/staff/reports/summary/`) and the report page can print to PDF or download CSV in the browser; nothing is generated server-side or stored in Supabase Storage.
- [x] Owner-only access; Cashier restricted
- [ ] Reconciliation view for paid, pending, and failed payments. Only paid payments are listed today.

Exit check: the Owner can produce a monthly report whose totals match the payment records.

## Phase 5: Member Mobile App

Goal: members can use their records and pay from their phones. Backend endpoints for each feature can be built in the earlier phases; this phase delivers the app.

- [ ] React Native app with NativeWind, react-native-reusables, and lucide-react-native. The dependencies and one screen are in place (`mobile/`); the app is a skeleton.
- [ ] Sign-up and login
- [ ] Self-enrollment and payment flow (shows only the enabled payment methods, then waits for webhook-confirmed status)
- [ ] Profile, attendance history, and subscription/expiry status screens
- [ ] Error and empty states, including the `pending` state

Exit check: a new member can sign up, pay, and see their active status in the app without staff help.

## Phase 6: Hardening & Launch

Goal: safe to run the real gym on.

- [ ] Security review: RBAC, webhook handling, HTTPS, no PII or payment details in logs, secrets only in env vars
- [ ] Handling of Vercel timeouts and Supabase connection limits under realistic load
- [ ] Import existing members from the paper logbooks
- [ ] Staff training and a short user guide for Owner, Cashier, and Trainer
- [ ] Pilot with a small group of members, then full rollout
- [ ] Basic monitoring and error reporting
- [ ] Login rate limiting (carried over from `AUDIT.md`; password reset is done)
- [ ] Decide the staff portal question the two-surface stack leaves open: keep both surfaces `AGENTS.md` now documents (the Django-templated pages and the static `web/` pages) and keep the duplicated screens in step, or converge onto one. Staff use the `web/` pages today.
- [ ] `web/` holds more than staff pages (the member web portal, the PWA shell, the public landing page), while `AGENTS.md` calls it the static staff pages. Widen that line to cover them or retire them.
- [ ] Every permission area in the code present as a row in the `AGENTS.md` matrix or removed: announcements, notifications, and trainer assignment and requests are not rows today. (Staff invites are covered by "the Owner assigns staff roles".)
- [ ] The `web/` pages pull Font Awesome and Google Fonts from CDNs, which `AGENTS.md` now allows for the static surface. This only matters if the PWA must work offline: vendor those two assets locally.

Exit check: the gym runs a full week using ProFit with no logbook fallback.

## Phase 7: After Launch

- [ ] Register the business with PayMongo, then turn on the rest of the `AGENTS.md` method list (GCash, Maya, cards) by changing the configured list, plus any method-specific handling those methods need
- [ ] Update `Architecture.md` to match the enabled payment methods
- [ ] Collect staff and member feedback and prioritize fixes
- [ ] Revisit deferred ideas (for example drag-and-drop UI, which is currently out of scope)

## Conformance with AGENTS.md

`AGENTS.md` is the standard and it wins. Nothing below is a choice between two valid options: every line is a place where the code drifted from `AGENTS.md`, with the action `AGENTS.md` implies.

- **Payment methods.** `AGENTS.md` names GCash, Maya and cards. The list is read from one setting so a change stays configuration. PayMongo Wallet came from the first draft of this roadmap, is not in `AGENTS.md`, and is dropped.
- **Staff portal, two surfaces.** `AGENTS.md` fixes two stacks. The Django-templated pages (`templates/`, `components/`, `static/`) use Django templates, Tailwind, daisyUI, HTMX, Alpine, Lucide and django-components. The static pages in `web/` use plain HTML/CSS/JS with Font Awesome and Google Fonts from CDNs and call the API from the browser. Both are legitimate under `AGENTS.md`, so this is no longer a conformance gap: keeping both means the duplicated screens have to stay in step, which is the Phase 6 item.
- **Permission areas.** The pure helpers in `apps/accounts/permissions.py` encode the matrix exactly, but the code also runs areas the matrix does not list (announcements, notifications, trainer assignment and requests). `AGENTS.md` sanctions only what the matrix grants, so those areas need rows there or removal. Staff invites are already covered by "the Owner assigns staff roles".
- **Supabase Storage.** `AGENTS.md` names it for PDFs and profile images. Profile photos are data URLs in the database and report PDFs are printed in the browser: Phase 2 and Phase 4 items.
- **Scheduled jobs.** `AGENTS.md` puts `pg_cron` SQL in `supabase/cron/` with a documented way to apply it. The SQL and the documentation exist; applying it is still open.
- **Docs path.** `AGENTS.md` lists `docs/`. These docs sit at the repo root beside `PROJECT-LOG.md`, which `AGENTS.md` requires to be at the root; creating `docs/` is optional and would be a layout change in `AGENTS.md` first.

## Open questions and risks

- **Business registration:** timing controls when the `AGENTS.md` method list (GCash, Maya, cards) can be turned on; QR Ph is the only method that can run before it.
- **Vercel limits:** function timeouts and cold starts may affect webhook and report generation; test early.
- **Cron deployment:** `AGENTS.md` requires the `pg_cron` job to be applied by a documented route; decide the route and record when the job was applied.
- **Conflicting gym details:** the landing page, the footer and the legal pages disagree on the gym name, phone number and address; the owner must confirm one set.
- **Trainer scope:** the matrix gives the Trainer role attendance and its own profile, but the code also runs trainer assignment and requests; add the rows to `AGENTS.md` or drop the features.
