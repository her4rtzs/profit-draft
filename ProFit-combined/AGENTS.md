# ProFit: Gym Operations Management System

Gym operations system for Functional Fitness Gym. Replaces paper logbooks and group-chat financial reports. Staff use a Django web portal; members use a React Native mobile app. Both talk to one Django backend and one Supabase PostgreSQL database.

Architecture diagram: see `architecture.md` (humans only, do not load it unless asked).

## Stack
- Web (staff portal): Django templates, Tailwind CSS, daisyUI, HTMX, Alpine.js, Lucide Icons, django-components
- Mobile (member app): React Native, NativeWind, react-native-reusables, lucide-react-native
- Backend: Django + Django REST Framework, deployed as serverless functions on Vercel
- Database: Supabase PostgreSQL, accessed through the Django ORM
- Files: Supabase Storage via `django-storages` (PDFs, profile images)
- Payments: PayMongo (GCash, Maya, cards)
- Scheduled jobs: Supabase `pg_cron`

## Commands
Backend (run from repo root):
- Install: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- Run dev server: `python manage.py runserver`
- Run tests: `python manage.py test`
- Lint / format: `ruff check . && ruff format .`
- Make / apply migrations: `python manage.py makemigrations` / `python manage.py migrate`
- Check config: `python manage.py check`

Mobile (run from `mobile/`):
- Install: `npm install`
- Run: `npm start`
- Tests / lint: `npm test` / `npm run lint`

## Repo layout
<!-- Assumed monorepo layout. Adjust if yours differs. -->
- `manage.py`, `requirements.txt`, `vercel.json`: backend entry points and deploy config
- `profit/`: Django project (settings, urls, wsgi)
- `apps/membership/`: enrollment (staff-assisted and self-service), attendance, member profiles (Module 1)
- `apps/billing/`: subscriptions, PayMongo integration, webhook receiver; triggers auto-enrollment on paid signup (Module 2)
- `apps/finance/`: transaction history and reports (Module 3)
- `apps/accounts/`: users, roles, RBAC permissions
- `api/`: DRF serializers and viewsets for the mobile app
- `templates/`, `components/`, `static/`: staff web portal (page templates, django-components, compiled assets)
- `mobile/`: React Native member app
- `supabase/cron/`: `pg_cron` SQL definitions
- `docs/`: human-facing documentation

## Modules
1. **Membership**: enrollment, attendance records, member profiles. Enrollment happens two ways: staff enroll members via web, or members self-enroll (sign up and pay via PayMongo, then the system enrolls them automatically with no staff action). Members view their profile and attendance via mobile.
2. **Billing & Subscription**: daily gym subscription payments through PayMongo (2.2), including the first payment that triggers self-service enrollment. A `pg_cron` job (2.1) expires memberships automatically.
3. **Financial Dashboard**: transaction history (3.1) and financial reports (3.2). Owner only.

## Request flow
- Web requests go through Django views. Mobile requests go through DRF endpoints.
- Both create PayMongo payment intents.
- PayMongo reports results asynchronously to the webhook receiver, which updates payment status through the ORM.
- Self-enrollment flow:
  1. A visitor signs up on web or mobile. This creates a user with the Member role and a member profile in `pending` status (not enrolled, no gym access).
  2. The app creates a PayMongo payment intent for the enrollment/subscription fee.
  3. When the webhook reports the payment as paid, the handler, in one database transaction, marks the payment paid, enrolls the member (status `active`), and sets the membership expiry. No staff step is involved.
  4. Failed or abandoned payments leave the member `pending`.
- Staff-assisted enrollment (walk-ins, cash) still exists and uses the same membership enrollment service as the webhook path.
- `pg_cron` updates membership expiry directly in the database and bypasses Django. This is the one exception to "everything goes through the ORM".

## Rules
- Use the Django ORM for all application database access. No raw SQL in app code.
- Keep business logic out of views and serializers where practical; put it in services or models.
- Enrollment logic (creating or activating a membership, setting expiry) lives in one service in `apps/membership/`. Staff views and the webhook handler both call it. Do not duplicate it.
- Add or update tests for any change to billing, auth, permissions, or enrollment.
- Never log PII (names, contact details) or payment details.
- Never commit secrets. Read them from environment variables.
- Web UI: build reusable pieces as django-components. Use daisyUI classes before writing custom Tailwind. Use HTMX for partial page updates from Django views, and Alpine.js only for small client-side state (modals, dropdowns). Do not add React or other JS frameworks to the web portal.
- Mobile UI: style with NativeWind classes and prefer react-native-reusables components. Use `lucide-react-native` for icons.
- Compile Tailwind CSS at build time. Do not rely on a runtime CDN build in production.
- Assume timezone `Asia/Manila` and currency PHP.
- Do not edit applied migrations; add a new one.

## Session log
At the end of every session, append one entry to `PROJECT-LOG.md` at the repo root. Create the file if it does not exist. Append only: never edit or delete earlier entries. Do not include secrets, PII, or payment details.

Entry format:
```
## YYYY-MM-DD HH:MM (Asia/Manila): <short session title>
### What I asked for
<the user's request(s) this session, in one to three lines>
### What the agent decided and why
<each non-obvious decision and the reason, one bullet per decision>
### Decision-log skill
<the reusable pattern or lesson from this session that future sessions should apply>
```

## Payments (PayMongo)
- Amounts are in centavos (PHP 100.00 = `10000`).
- Verify the webhook signature before processing any event.
- Webhook handlers must be idempotent: the same event may be delivered more than once.
- Only the webhook sets a payment to paid or failed. Never trust the client redirect.
- Only the webhook triggers self-enrollment. Never enroll a member because the client redirect or app says payment succeeded.
- Payment confirmation and enrollment must succeed or fail together (single transaction). A duplicate webhook delivery must not create a second enrollment or extend the expiry twice.
- Match the paid event to the pending member and payment intent stored server-side. Do not trust member identifiers sent in webhook metadata alone without verifying them against the stored intent.

## Auth & roles (RBAC)
Roles: Owner, Cashier, Personal Trainer, Member. Enforce permissions server-side on both views and DRF endpoints.

| Area | Owner | Cashier | Trainer | Member |
|---|---|---|---|---|
| Financial Dashboard / reports | Yes | No | No | No |
| Record payments | Yes | Yes | No | Own only |
| Membership enrollment (staff-assisted) | Yes | Yes | No | No |
| Self-enrollment (sign up + pay) | n/a | n/a | n/a | Own only, completed automatically by the webhook |
| Attendance records | Yes | Yes | Yes | View own |
| Own profile | Yes | Yes | Yes | Yes |

Public sign-up may only create the Member role. It must never allow choosing or escalating to Owner, Cashier, or Personal Trainer; the Owner assigns staff roles. A member who has signed up but not paid is `pending` and has no member-level access (attendance, subscription features) until enrolled.

Passwords use Django's password hashers (confirm `PASSWORD_HASHERS` in settings). All traffic must be HTTPS.

## Deployment constraints (Vercel + Supabase)
- Serverless: no background workers, no persistent local filesystem, and function timeouts apply. Use `pg_cron` or webhooks instead of in-process jobs.
- Use the Supabase pooler in transaction mode; set `DISABLE_SERVER_SIDE_CURSORS = True` and keep `CONN_MAX_AGE` low or zero.
- Serve static files via a serverless-compatible approach (for example WhiteNoise). Do not rely on local disk.
- `pg_cron` jobs are not managed by Django migrations. Their SQL lives in `supabase/cron/` and must be applied manually or via a documented script.

## Environment variables (names only)
`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`