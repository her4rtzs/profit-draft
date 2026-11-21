# ProFit Roadmap

Phases are ordered by dependency, not by date. Each phase has an exit check: do not start the next phase until it passes. Check items off as they are completed.

`AGENTS.md` is the source of truth for the stack, the rules, the RBAC matrix, the payment rules and the repo layout. This file is only the delivery order: when the two disagree, `AGENTS.md` wins and this file is corrected. Session history lives in `PROJECT-LOG.md`; the diagram lives in `Architecture.md`.

Convention: `[x]` means verified against the code, `[ ]` means not done. Where part of an item already exists, a note says what is there.

Last reviewed: 2026-11-21, PayMongo removed from the code and the trial/claim flows built; Phase 4.6 gate checks still pending.

## Current status

**The system is at Phase 4 (Financial Dashboard), in progress. Phases 0 to 3 have passed their exit checks, Phase 4 has not. Phase 4.5 (Installable Web App) is implemented; its real-phone gate is still open. Phase 4.6 (Free Trial and GCash Claim Review) is implemented in code; its gate checks are still pending.**

| Phase | State | What is actually there |
|---|---|---|
| 0 Foundation | Pass | Scaffold, env-driven settings, SQLite offline fallback, `vercel.json`, WhiteNoise, build-time Tailwind + daisyUI, django-components, `Asia/Manila` + PHP. Gap: `ruff` is run ad hoc, it is not in `requirements.txt` and there is no CI. |
| 1 Accounts & RBAC | Pass | Custom `accounts.User` + `Role` (Owner/Cashier/Trainer/Member), session login/logout for the portal and DRF, single-sourced RBAC in `apps/accounts/permissions.py` enforced on both view and DRF adapters, matrix tests in `apps/accounts/tests/test_permissions.py`. Extra: email-OTP signup, Owner staff invites, change-password, and forgot/reset password (email code, `web/forgot.html`). Still missing: login rate limiting. |
| 2 Membership Management | Pass, with one deviation | `MemberProfile`/`Enrollment`/`Attendance`, `enroll_member`/`renew_member`/`check_in_member` in `apps/membership/services.py`, staff-assisted enrollment, attendance history, `PENDING` vs `ACTIVE`. Deviation: the member photo is a base64 data URL in `MemberProfile.photo_data`, not Supabase Storage. |
| 3 Billing & Subscription | Pass, with deviations | PayMongo Checkout Sessions, webhook with signature verification + idempotent handling + race handling (`apps/billing/webhooks.py`), self-enrollment in one transaction (`complete_signup`), pay-first join, failed/abandoned payments stay pending, desk cash/GCash/bank payments (`finance.ManualPayment`), webhook/checkout tests. Deviations: see Conformance with AGENTS.md. |
| 4 Financial Dashboard | **In progress** | Owner-only gate, transaction list with search/member/method filters, monthly totals (`monthly_summary`), client-side CSV and print-to-PDF export. Missing: server-side PDF stored in Supabase Storage, status reconciliation view, and a status filter over paid/pending/failed. |
| 4.5 Installable Web App | Implemented, gate open | Static `web/manifest.webmanifest` served by WhiteNoise at the site root with `application/manifest+json` via `WHITENOISE_MIMETYPES`, `static/icons/` (192, 512, maskable 512, Apple 180) from the approved logo, manifest/theme-color/Apple tags on every page, install card on three pages, `static/js/install-help.js`, `profit/tests/test_installable.py`. No service worker, offline cache, or push. The old `web/sw.js`, `web/pwa.js` and service worker registration are deleted. Real-phone install check still to be done by the owner. |
| 4.6 Free Trial & GCash Claims | In progress | PayMongo removed, free 7-day `trial`, GCash claims with a reference and a Drive screenshot link, Owner/Cashier approval enrolling through the shared service, cash at the desk, cash/GCash-only dashboard totals. Gate checks pending. |
| 5 Member Mobile App | Removed | Native app dropped; members use the installable web portal in Phase 4.5. The Expo skeleton was deleted from the repo. |
| 6 Hardening & Launch | Not started | No security review, no load testing, no member import, no staff guide, no monitoring. |
| 7 After Launch | Not started | No payment-gateway registration (cash and GCash only), no extra payment methods; the payment docs are rewritten in Phase 4.6. |

## Built outside this roadmap

These exist in the code but are not in the phases below and are not sanctioned by `AGENTS.md`, which describes three modules and a staff-only web portal. Each needs a phase of its own plus a line in `AGENTS.md`, or removal:

- Announcements (staff publish, member read) — `apps/announcements/`
- Notifications (server-backed bell, read state) — `apps/notifications/`
- Trainers: assignment and member requests — `apps/trainers/`
- Staff portal pages: attendance, payments, reports, members, settings, profile, change-password, trainer portal
- Member portal and pay-first join (`web/join.html`, `billing.PendingSignup`)
- PWA shell (`web/sw.js`, `web/manifest.webmanifest`) and the portal UX/theme work (the "phase 10/11" bundles in `CHANGES-phase11.md`) — the service worker and static manifest are gone; the installable-app step is now Phase 4.5. The portal UX/theme work is still outside the phases.
- Landing page, FAQ, Terms, Privacy and the shared footer

## Phase 0: Foundation

Goal: an empty but deployable skeleton.

- [x] Repo scaffold matching the layout in `AGENTS.md` (`profit/`, `apps/`, `api/`, `components/`, `supabase/cron/`). Note: `docs/` from the `AGENTS.md` layout is the Obsidian vault; `mobile/` was removed when the web portal became installable.
- [x] Django project connected to Supabase PostgreSQL through the transaction-mode pooler (`DISABLE_SERVER_SIDE_CURSORS = True`, `CONN_MAX_AGE = 0`)
- [x] Vercel deployment with `vercel.json`, WhiteNoise static files, and env vars set
- [x] Tailwind + daisyUI compiled at build time; django-components, HTMX, Alpine.js, Lucide wired into a base template
- [ ] Lint (`ruff`) and test commands running, ideally in CI. `ruff` is not in `requirements.txt` and there is no `.github/`, so nothing runs them automatically.
- [x] `Asia/Manila` timezone and PHP currency configured

Exit check: a "hello" page deploys to Vercel, reads from Supabase, and renders with Tailwind/daisyUI styles.

## Phase 1: Accounts & RBAC

Goal: secure login and the permission model everything else relies on.

- [x] Custom user model and roles: Owner, Cashier, Personal Trainer, Member
- [x] Login/logout for the staff portal; session auth for the DRF web API (session auth in `api/auth.py`)
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

> **Superseded for online payments by Phase 4.6.** PayMongo is removed and sign-up no longer goes through an online checkout. The items below record what shipped at the time and keep their check state; do not rebuild them.

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

## Phase 4.5: Installable Web App

Goal: staff and members can put the portal on a phone's home screen and open it like an app. It is a shortcut with an icon; the site still needs internet, and login, roles and sign-out are unchanged.

- [x] A static `web/manifest.webmanifest` (served by WhiteNoise at the site root, so no Django view) with the contract values (`id`, `start_url`, `scope` = `/`, name/short_name `ProFit`, `standalone`, `#0a0e17` background and theme taken from the dark portal header, no orientation lock), and `.webmanifest` registered as `application/manifest+json` in `WHITENOISE_MIMETYPES`
- [x] Four committed PNG icons in `static/icons/` from the approved logo: 192, 512, maskable 512, Apple 180; solid background, no alpha, no image library added
- [x] Manifest link, one `theme-color` tag and the Apple web-app tags in `templates/base.html` and every `web/` page
- [x] Install card with iPhone and Android steps on `web/settings.html`, `web/trainer/settings.html` and `web/member-home.html`, switched by `static/js/install-help.js` (no custom button, no `beforeinstallprompt`)
- [x] The forbidden PWA shell is gone: `web/sw.js`, `web/pwa.js` and `web/manifest.webmanifest` deleted
- [x] Tests in `profit/tests/test_installable.py` cover the manifest, anonymous access, PNG headers, head tags, the card, and the absence of a service worker
- [ ] **Owner gate, on real phones:** install on the deployed HTTPS site (iPhone Safari Share → Add to Home Screen; Android Chrome Install app or Add to Home screen), confirm the icon, name, standalone launch, the login/role/sign-out/deactivated-account checks, and that the card reads "You're using the installed app."

Deviations: the portal has no single page every role can open, so the card is on three pages (staff settings, trainer settings, member home) instead of one shared partial. A dark-mode phone may briefly show the light launch splash, because a manifest has one background colour.

Exit check: both phones pass the owner's checklist above.

## Phase 4.6: Free Trial and GCash Claim Review

Goal: remove the payment gateway. Sign-up is free with a 7-day trial, GCash payments are claims reviewed by staff, and cash is recorded at the desk.

- [x] Remove PayMongo: delete checkout creation, the webhook receiver and its route, `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET`. Keep every existing payment row and PayMongo reference as history.
- [x] Free sign-up creates a Member with status `trial` for 7 days: app access only, no gym membership and no attendance.
- [ ] GCash claim form: GCash reference number and an https Google Drive screenshot link, saved as `pending_review`. The amount comes from the server-side plan price, never from the form.
- [ ] Owner/Cashier review queue: approve or reject a claim; the member sees only their own claims. Enforced on the server.
- [ ] Approval marks the claim `approved` and enrolls through the one membership service in a single transaction; a repeated approval changes nothing.
- [ ] Cash desk payments recorded by staff through the same service, with `recorded_by` set.
- [ ] Financial Dashboard counts `paid` cash rows and `approved` GCash claims only; `pending_review` and `rejected` claims are excluded and old PayMongo rows stay as history.
- [ ] Tests: a submitted claim grants no access; only Owner/Cashier can review; approval enrolls exactly once; a duplicate approval does not extend the expiry; a client-sent amount is ignored; a member cannot see another member's claims.
- [ ] Update the public landing page, join page and FAQ copy: cash and GCash only, free sign-up with a 7-day trial, no online checkout.

Exit check: a new member signs up free, stays `trial`, submits a GCash claim that grants nothing, and becomes `active` only after a Cashier approves it, with the dashboard counting that payment once.

## Phase 5: Member Mobile App

Goal: members can use their records and pay from their phones. Backend endpoints for each feature can be built in the earlier phases; this phase delivers the app.

- [ ] Sign-up and login
- [ ] Self-enrollment and payment flow (shows only the enabled payment methods, then waits for webhook-confirmed status)
- [ ] Profile, attendance history, and subscription/expiry status screens
- [ ] Error and empty states, including the `pending` state

Exit check: a new member can sign up, pay, and see their active status in the app without staff help.

## Phase 6: Hardening & Launch

Goal: safe to run the real gym on.

- [ ] Security review: RBAC, GCash claim review, HTTPS, no PII or payment details in logs, secrets only in env vars
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

- [ ] If the gym later registers with a payment gateway, revisit online cards or bank transfer as a new decision; the current design is cash and GCash only
- [ ] Re-read `Architecture.md` and `AGENTS.md` after Phase 4.6 to confirm the payment sections match the code
- [ ] Collect staff and member feedback and prioritize fixes
- [ ] Revisit deferred ideas (for example drag-and-drop UI, which is currently out of scope)

## Conformance with AGENTS.md

`AGENTS.md` is the standard and it wins. Nothing below is a choice between two valid options: every line is a place where the code drifted from `AGENTS.md`, with the action `AGENTS.md` implies.

- **Payment methods.** Superseded by Phase 4.6: `AGENTS.md` now names cash and GCash only, and PayMongo is removed. The old method list (GCash, Maya, cards) and the PayMongo Wallet note no longer apply.
- **Staff portal, two surfaces.** `AGENTS.md` fixes two stacks. The Django-templated pages (`templates/`, `components/`, `static/`) use Django templates, Tailwind, daisyUI, HTMX, Alpine, Lucide and django-components. The static pages in `web/` use plain HTML/CSS/JS with Font Awesome and Google Fonts from CDNs and call the API from the browser. Both are legitimate under `AGENTS.md`, so this is no longer a conformance gap: keeping both means the duplicated screens have to stay in step, which is the Phase 6 item.
- **Permission areas.** The pure helpers in `apps/accounts/permissions.py` encode the matrix exactly, but the code also runs areas the matrix does not list (announcements, notifications, trainer assignment and requests). `AGENTS.md` sanctions only what the matrix grants, so those areas need rows there or removal. Staff invites are already covered by "the Owner assigns staff roles".
- **Supabase Storage.** `AGENTS.md` names it for PDFs and profile images. Profile photos are data URLs in the database and report PDFs are printed in the browser: Phase 2 and Phase 4 items.
- **Scheduled jobs.** `AGENTS.md` puts `pg_cron` SQL in `supabase/cron/` with a documented way to apply it. The SQL and the documentation exist; applying it is still open.
- **Docs path.** `AGENTS.md` lists `docs/`. These docs sit at the repo root beside `PROJECT-LOG.md`, which `AGENTS.md` requires to be at the root; creating `docs/` is optional and would be a layout change in `AGENTS.md` first.

## Open questions and risks

- **Business registration:** no longer blocks payments, because there is no gateway. It only matters if online cards or bank transfer are ever added back.
- **Vercel limits:** function timeouts and cold starts may affect report generation; test early.
- **Cron deployment:** `AGENTS.md` requires the `pg_cron` job to be applied by a documented route; decide the route and record when the job was applied.
- **Conflicting gym details:** the landing page, the footer and the legal pages disagree on the gym name, phone number and address; the owner must confirm one set.
- **Trainer scope:** the matrix gives the Trainer role attendance and its own profile, but the code also runs trainer assignment and requests; add the rows to `AGENTS.md` or drop the features.
