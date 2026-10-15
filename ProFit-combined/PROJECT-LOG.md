## 2026-10-07 20:39 (Asia/Manila): FEAT-001 backend scaffold + accounts/RBAC
### What I asked for
Create the app: implement FEAT-001 of the ProFit first-build scaffold (project
scaffold, env-driven settings with offline SQLite fallback, Vercel entry/deploy
config, and apps/accounts with a custom User + Role + single-sourced pure RBAC
helpers and view/DRF adapters), then run and record its verification.
### What the agent decided and why
- Set COMPONENTS["autodiscover"]=False: the local .venv lives under BASE_DIR, so
  django-components 0.100 autodiscover walked it and crashed on a relative import
  at startup. No components exist in this FEAT, so disabling it is the minimal,
  correct fix; a later FEAT with real components re-wires via the template loader.
- Used an explicit TEMPLATES loaders list (filesystem, app_directories,
  django_components) instead of APP_DIRS, since the two cannot be set together and
  the django-components loader must be in the chain.
- Verified django-components 0.100 wiring against the installed package source
  (loader path `django_components.template_loader.Loader`, lowercase `dirs` key)
  rather than guessing from docs, per the design's instruction to confirm the pin.
- Kept DISABLE_SERVER_SIDE_CURSORS=True and CONN_MAX_AGE=0 unconditional and made
  the 5432-vs-6543 pooler check an advisory WARNING only, matching the design.
- Confirmed fail-fast: DEBUG=False with unset ALLOWED_HOSTS raises
  ImproperlyConfigured at startup; DEBUG=True falls back to localhost.
### Decision-log skill
When a tool/library's setup is version-sensitive and the exact pin is installed,
inspect the installed package source to confirm the real API shape before wiring
it, instead of trusting docs for a different version. And when a dev artifact
(like an in-repo .venv) lives under BASE_DIR, be wary of framework features that
tree-walk the project root (autodiscover, file watchers) and scope or disable them.

## 2026-10-07 21:15 (Asia/Manila): FEAT-002 membership models/services/API/web shell
### What I asked for
Create the app: implement FEAT-002 (membership models with Attendance.save()
materializing check_in_date; services enroll_member/record_attendance with
idempotency; the DRF read API with /api/membership/me/ and /api/attendance/ under
a DefaultRouter; minimal staff web views; and the web portal shell with
build-time Tailwind/daisyUI, a button + icon django-component, one HTMX partial,
and vendored HTMX/Alpine/Lucide), then run and record its verification.
### What the agent decided and why
- Registered the two components via COMPONENTS["libraries"] rather than
  re-enabling autodiscover: FEAT-001 disabled autodiscover because the in-repo
  .venv under BASE_DIR broke the tree-walk, and django-components 0.100 runs
  import_libraries() at startup regardless of autodiscover, so an explicit
  library list is the minimal, deterministic way to register components.
- Added a custom system check (membership.E001) that renders the button
  component during `manage.py check`, turning "the component renders" into an
  enforced gate; confirmed a wrong loader path makes it fail (negative control).
- Did NOT apply CanViewAttendance as a blanket has_permission on the attendance
  list: the pure helper correctly returns False for a Member with no target,
  which would 403 a member listing their own records. The list uses
  IsAuthenticated + a queryset scoped to member__user=request.user (so a
  profile-less user gets 200 []), and CanViewAttendance guards object reads. This
  honors the acceptance criteria without changing the single-sourced RBAC policy.
- Used 404 (not 403) for /api/membership/me/ when the caller has no profile, per
  the design: it is "no such resource for you," and staff simply have no profile.
### Decision-log skill
A single-sourced pure permission helper may be too strict for a collection
endpoint (no object target), so enforce list isolation with the queryset and
reserve the object-permission for has_object_permission, rather than loosening
the shared policy. And when an acceptance criterion says "X renders," encode it
as a system check that actually renders X during `manage.py check`, with a
negative control proving a broken wiring fails the gate.

## 2026-10-07 21:30 (Asia/Manila): FEAT-003 billing webhook + finance dashboard + pg_cron stub
### What I asked for
Create the app: implement FEAT-003 (billing model stubs Subscription/Payment/
WebhookEvent; services with create_payment_intent NotImplementedError and the
single-writer mark_payment_paid/mark_payment_failed; the concrete race-safe
PayMongo webhook implementing the four Revision 4 binding fixes; finance
TransactionRecord stub + Owner-only financial_dashboard; and the pg_cron
membership-expiry SQL stub), then run and record its verification.
### What the agent decided and why
- Implemented the signature exactly per the Revision 4 BINDING spec in
  FEAT-003.json / context.json, which overrides design.md: the signed message is
  t.encode() + b"." + raw_body (byte-exact), and raw_body is never decoded before
  hashing. design.md still showed raw_body.decode(); the feature/context files are
  authoritative, so I followed them and noted the divergence.
- Added PAYMONGO_WEBHOOK_SECRET to settings (env-read, empty default). FEAT-001
  put the eight env NAMES in .env.example but defined no setting that reads one;
  the webhook needs it, so this is the first consumed secret. Empty secret -> the
  verifier returns False and every event 400s, which is the safe offline default.
- Made both payment mutators no-op on an already-terminal payment so out-of-order
  webhook redelivery cannot un-settle a payment (NIT-4), keeping them the sole
  PAID/FAILED writers.
- The finance dashboard-gate test overrides STORAGES to the plain
  StaticFilesStorage: rendering base.html via {% static 'app.css' %} needs the
  collectstatic manifest, a deploy artifact absent offline, which otherwise 500s
  the Owner-sees-200 assertion. The override is a test-env concern only and does
  not change production behavior.
- Kept the pg_cron SQL fully commented and documented as not ORM-managed / applied
  manually (the sole AGENTS.md raw-SQL exception), with table/column names matching
  the ORM output and a rename warning.
### Decision-log skill
When a binding feature/context spec and an older design doc disagree on an exact
detail (here, hash the raw bytes vs the decoded string), follow the authoritative
spec and record the divergence rather than silently averaging them. And when a
view-render test trips production-only infrastructure (a manifest static storage),
scope the relaxation to the test via override_settings instead of weakening the
real configuration.

## 2026-10-07 21:46 (Asia/Manila): FEAT-004 RBAC matrix + webhook suite + mobile skeleton + session-auth
### What I asked for
Create the app: implement FEAT-004 (the authoritative RBAC matrix for all four
roles on BOTH a view adapter and a DRF adapter; the exhaustive webhook signature
and idempotency suite including the concurrent-insert IntegrityError path and the
UNKNOWN_PAYMENT->retry->PROCESSED race fix; the React Native mobile skeleton using
the binding CSRF token-echo auth sequence with the Django ensure_csrf_cookie +
session login endpoints), then run the full verification and record it.
### What the agent decided and why
- Built the Django session-login + csrf endpoints as PLAIN Django views, not DRF
  APIViews. DRF's SessionAuthentication only runs its CSRF check while
  authenticating an already-logged-in session, so an anonymous login via APIView
  would NOT be CSRF-checked. Plain views keep CsrfViewMiddleware enforcing CSRF on
  the login POST, which is exactly the binding requirement (echo X-CSRFToken, no
  CSRF-exempt endpoint). Tested with Client(enforce_csrf_checks=True): 403 without
  the token, 200 with it.
- Made the RBAC matrix table-driven over SimpleNamespace role stand-ins for the
  pure helpers (they never touch the DB), and used list-of-tuples rather than
  dict keys because SimpleNamespace is unhashable. For the adapter-enforcement
  layer I defined a test-only ROOT_URLCONF in the test module with DRF APIViews
  guarded by the real BasePermission adapters, so "a Cashier is denied financials"
  is proven on both the view surface (role_required) and the DRF surface.
- Expanded the existing webhook smoke test into the exhaustive suite by ADDING the
  two cases FEAT-003 explicitly deferred: a duplicate-PROCESSED no-op proven with a
  mock spy on mark_payment_paid/mark_payment_failed plus a WebhookEvent count
  assertion, and the concurrent-insert path by patching get_or_create to raise
  IntegrityError so the except branch re-reads the pre-seeded terminal winner.
- Pinned the mobile skeleton to NativeWind v4 + Expo SDK 52 conventions
  (build-time Tailwind via the Metro+Babel plugins, no runtime CDN) and read the
  API base URL from Expo config (app.json extra) with a localhost default rather
  than hard-coding it. The app holds no business logic; the client just runs the
  four-step sequence and the one screen renders it with a react-native-reusables
  Card and lucide icons.
### Decision-log skill
When an endpoint must be CSRF-protected for ANONYMOUS callers, don't assume a DRF
APIView gives you that: DRF only enforces CSRF during session authentication of an
already-authenticated request, so an anonymous login POST slips through. Use a
plain Django view so CsrfViewMiddleware applies, and prove it with
Client(enforce_csrf_checks=True). And to test adapter-level enforcement without
touching production routes, define a scoped ROOT_URLCONF inside the test module
and point override_settings at it.

## 2026-10-07 21:52 (Asia/Manila): Cross-FEAT integration verification
### What I asked for
Create the app: run the whole-scaffold integration gate now that all four FEATs
are implemented and committed — the full offline `python manage.py check` (the
example django-component must render) and the full `python manage.py test` suite
on Python 3.13 — fix any seams between accounts/membership/billing/finance/api
(URL wiring, INSTALLED_APPS, cross-app imports, migration consistency) until both
pass, and record the real output in verification.md.
### What the agent decided and why
- Ran the gate against the whole project (no per-app selection) in the existing
  Python 3.13.14 `.venv` with the pinned requirements already installed, offline
  with DATABASE_URL unset so the SQLite default is used. `python manage.py check`
  reported 0 issues and the full `python manage.py test` ran 55 tests OK (exit 0).
- Made NO code changes: every seam already holds. All four dotted app labels are
  in INSTALLED_APPS, the cross-app URL includes resolve (`/api/`, `/membership/`,
  `/finance/`, `/webhooks/paymongo/`, `/api/auth/*`), and the migration graph
  (accounts -> membership -> billing/finance) applies in one pass. There was no
  review.json, so this was the first-iteration integration pass, not a findings
  fix; introducing changes with a green gate would have violated minimal-change.
- Treated the `UserWarning: No directory at ...\staticfiles\`, the logged
  Forbidden/Bad Request/Not Found lines, and the two PermissionDenied tracebacks
  as expected: they are the asserted outcomes of the negative-path RBAC and
  webhook tests, confirmed by the final `OK` / exit 0, not failures.
- Captured output via `Start-Process` with redirected stdout/stderr files because
  PowerShell wraps a native command's stderr as NativeCommandError and re-encodes
  it; reading the plain redirected files gave the true, un-mangled test summary
  and exit code. Removed all temporary capture files afterward.
### Decision-log skill
When the integration gate is already green on the first pass, the correct action
is to record it and stop, not to invent changes — a passing whole-suite run is
the deliverable. And on Windows/PowerShell, a native tool that logs progress to
stderr can look like an error (NativeCommandError, UTF-16 mangling); redirect
stdout/stderr to files and read those for the authoritative result and exit code
rather than trusting the shell's inline rendering.

## 2026-10-07 22:20 (Asia/Manila): Final confirmation pass + task completion
### What I asked for
Create the app: with the review APPROVED, do the final confirmation pass — re-run
`python manage.py check` and the full `python manage.py test` offline on Python
3.13, confirm verification.md reflects the real output, set task.json status to
completed, ensure PROJECT-LOG.md has this session entry, and commit all work
locally without pushing or opening a PR.
### What the agent decided and why
- Re-ran both gates offline (DATABASE_URL unset -> SQLite) on Python 3.13.14:
  `manage.py check` reported 0 issues (exit 0) and the full `manage.py test` ran
  55 tests OK (exit 0). These match the figures already recorded in
  verification.md, so no edits to that file were needed — it reflects the real
  final output.
- Made NO code changes: the scaffold was already APPROVED and both gates are
  green, so per minimal-change the only actions were the completion bookkeeping
  (task.json status, this log entry).
- Confirmed exit codes via `Start-Process` with redirected stdout/stderr files
  plus the captured `ExitCode`, because PowerShell mangles Django's stderr test
  progress into NativeCommandError noise; the redirected files gave the true
  `Ran 55 tests ... OK` summary and `EXIT=0`.
- Left the branch on `main` without pushing and without opening a PR, as the
  instruction requires the caller to handle release.
### Decision-log skill
A final confirmation pass on an already-approved build is a verification-and-
bookkeeping step, not a coding step: re-run the gates, confirm the recorded
output still matches reality, update status, and stop — do not touch code when
the gate is green. On Windows, trust an explicitly captured process ExitCode and
redirected stream files over the shell's inline rendering of a native tool.

## 2026-10-10 17:15 (Asia/Manila): GitHub setup, README, run locally, public landing page
### What I asked for
Create a private GitHub repo and push the app; add a README; run the app
locally; explain why there were no web pages and then create a homepage/landing
page; and always append a session entry to PROJECT-LOG.md.
### What the agent decided and why
- Did not create the GitHub repo autonomously: gh CLI was absent, so I installed
  it via winget, but authentication (gh auth login) must be done by the user
  since I cannot log into their account. Pushed only after confirming auth.
- Reverted a slipped-in real-looking value in .env.example (SECRET_KEY=@unFIt3,
  DEBUG=off) before any commit/push: .env.example must hold names only, and
  committing a secret value violates the AGENTS.md no-secrets rule.
- Confirmed db.sqlite3 was already git-ignored and untracked, so the local dev
  database never reaches the remote; no change was needed.
- Verified every git/gh step by reading actual state (git ls-remote, gh repo
  view --json) and output files rather than trusting the terminal, because this
  Windows PowerShell session has a PSReadLine rendering glitch that echoes
  commands and reports exit -1 even on success.
- Explained "no web pages" factually by reading the URLConf and views: there was
  no route at "/" (bare root 404 by design) and all staff views are gated by
  role_required with no seeded users — not a bug.
- Built the landing page as a public, no-auth, no-DB view at "/" so it exposes no
  member/payment/financial data; it extends base.html and uses daisyUI classes +
  the existing icon django-component (only referencing the five vendored Lucide
  SVGs), honoring the AGENTS.md web-UI rules (no new JS frameworks, no business
  logic in the view).
- Pointed the landing "Sign in" button at /admin/ because the only HTML login in
  this scaffold is the Django admin; the member login is an API endpoint for the
  mobile app, not an HTML form.
### Decision-log skill
Account-bound external actions (creating a repo, authenticating a CLI) require
the user to supply credentials — install and wire up what you can, then hand off
the auth step rather than assuming it. On a terminal whose inline output is
unreliable, verify outcomes from authoritative state (remote refs, API JSON,
redirected files) instead of the shell's rendering. And a public landing page
must be strictly read-only and auth-free: no DB access, no gated data, linking
into the authenticated surfaces rather than embedding them.

## 2026-10-10 19:45 (Asia/Manila): Custom member auth — email-OTP signup + staff-invite foundation
### What I asked for
Custom login/signup pages for members with an email OTP verification step
(6-digit code, 10-minute expiry), public self-signup limited to Members, and the
backend foundation for an Owner-initiated staff invite via email.
### What the agent decided and why
- Built the HTML pages as plain Django function views (not DRF APIViews) so
  CsrfViewMiddleware protects the anonymous signup/verify/login POSTs, mirroring
  the existing api/auth.py reasoning.
- Called the Resend HTTPS API from a custom email backend using only stdlib
  urllib (no new `requests` dependency); selection falls back to the console
  backend when RESEND_API_KEY is unset and DEBUG is True, and raises
  ImproperlyConfigured when unset with DEBUG=False so prod never prints OTPs to
  logs.
- Stored OTP codes and invite tokens as Argon2 hashes via make_password/
  check_password (never plaintext); OTP is single-use, capped at 5 attempts,
  with a 60s resend cooldown; the code is never logged.
- Made signup/login responses observably identical across new/existing-inactive/
  already-active branches (anti-enumeration), including handling the
  username-unique race (IntegrityError) by re-reading and returning the generic
  result instead of 500ing.
- Shipped the Owner invite path this pass as a management command
  (invite_staff) plus the invitee-facing accept page; the full Owner dashboard UI
  is deferred. The invitee can never choose the role — it is fixed on the invite
  and read from invite.email, not the request.
- In tests, overrode STORAGES to the non-manifest static storage so templates
  extending base.html render without a Tailwind/collectstatic build artifact.
- Installed ruff==0.9.6 into the .venv only to run the lint/format gates (it was
  not previously installed and is not in requirements); formatted only the files
  this task touched and left pre-existing lint/format issues in untouched files
  alone to respect scope.
### Decision-log skill
When a backend side effect can fail (email delivery), persist the durable state
first and let the user retry, converting the failure into a user-facing message
rather than a 500 — and keep every externally observable response identical
across "exists / doesn't exist" branches to avoid account enumeration. When a
required lint/format tool is missing and the repo was never linted, scope the fix
to the files you changed and flag the pre-existing debt instead of mass-rewriting
unrelated code.

## 2026-10-10 21:05 (Asia/Manila): Member auth approved — custom login/signup OTP + staff-invite foundation
### What I asked for
Finalize the review-APPROVED custom member authentication: HTML login/signup
pages with an email-OTP verification step (6-digit, 10-minute expiry) for
members-only self-signup, plus the Owner-initiated staff-invite backend
foundation sent by email.
### What the agent decided and why
- Scoped public self-signup to Members only; Cashier/Trainer accounts are never
  self-registered but provisioned by the Owner via a single-use emailed invite,
  so the signup funnel can never mint a privileged role.
- Built login/signup/verify as plain Django function views (not DRF APIViews) so
  CsrfViewMiddleware protects the anonymous POSTs, matching the existing
  api/auth.py reasoning rather than relying on DRF's auth-time CSRF check.
- Called Resend over HTTPS from a custom email backend using only stdlib
  urllib.request — avoiding a new `requests` dependency — with a console-backend
  fallback when RESEND_API_KEY is unset and DEBUG is True, and a hard
  ImproperlyConfigured when unset with DEBUG=False so prod never prints OTPs to
  logs.
- Stored both the OTP code and the invite token only as Argon2 hashes via
  make_password/check_password: the OTP is 6-digit, hashed, single-use,
  attempt-capped at 5, 10-minute expiry with a 60s resend cooldown, and the raw
  code is never logged; the invite token is likewise hashed, expiring, and
  single-use.
- Kept signup/login responses observably identical across the new /
  existing-inactive / already-active branches (anti-enumeration), including the
  username-unique race (IntegrityError) which re-reads and returns the generic
  result instead of 500ing.
- Single-sourced the Owner-only invite authority through the pure
  permissions.can_manage_staff_invites helper so views, the service, and the
  management command all enforce one policy; the invitee's role is fixed on the
  invite and the account email/username are read from invite.email, never from
  the accept request.
### Decision-log skill
Keep a product invariant in exactly one layer and have every surface call it:
the "only Owner invites" and "invitee cannot pick their role" rules live in the
service/RBAC helper and the stored invite, so views and commands only translate
to HTTP and never re-decide policy. When a feature needs an outbound HTTP call,
reach for the stdlib (urllib) and an env-driven backend-selection seam before
adding a dependency, and fail fast at settings-import time on an unsafe prod
configuration rather than degrading silently.

## 2026-10-10 21:35 (Asia/Manila): Verify member-auth build; hold GitHub commit
### What I asked for
Confirm the completed member-auth feature actually works, and do not commit or
push to GitHub until explicitly told; just add a PROJECT-LOG entry.
### What the agent decided and why
- Independently re-verified rather than trusting the workflow's notifications:
  ran manage.py check (0 issues), the full suite (94 tests discovered and
  passing — the suite needs explicit app labels because tests live in per-app
  tests/ packages, and takes ~67s due to Argon2 hashing in the OTP/invite tests),
  and confirmed /accounts/login,/signup,/verify each return HTTP 200.
- Read the terminal output as evidence only through captured files / the
  background-process terminal, because this PowerShell session's PSReadLine
  glitch echoes commands and reports exit -1 even on success; the inline shell
  rendering is not trustworthy here.
- Treated the Forbidden/PermissionDenied/Unauthorized/CSRF-forbidden log lines
  during the test run as expected negative-path assertions, not failures; noted
  the attempt-cap log records only user_id, never the OTP (confirms no-OTP/PII
  logging).
- Held all changes in the working tree: per the user's instruction, nothing is
  committed or pushed to GitHub until they say so. The standing rule to append a
  PROJECT-LOG entry every session still applies and is honored here.
- Left a flagged, unverified item for the user: .env.example appears to contain
  real-looking secret values again; I did not change it this session and will
  clean it before any future commit.
### Decision-log skill
"Done and approved" by a sub-process is not self-verification: re-run the gates
yourself from authoritative output (captured files), and separate expected
negative-path log noise from real failures. Respect an explicit hold on
publishing — keep work local and auditable — while still recording the session
in the append-only log.

## 2026-10-12 10:20 (Asia/Manila): Commit member-auth work, withholding unsafe files
### What I asked for
Commit the finished member-auth work to the repository (the user had put a hold on committing until told).
### What the agent decided and why
- Found that the working-tree .env.example now holds real-looking Supabase credentials and a project URL. It was staged, so I unstaged it and left it out of the commit. A secret in git history is not removed by deleting it later. The remote copy of .env.example was checked and is still names-only.
- Scanned the source files for secret-shaped strings instead of trusting the staged-diff dump, because PowerShell writes redirected output as UTF-16 and a search over that file silently matches nothing.
- Left AGENTS.md and vercel.json out of the commit. Their edits (a removed python3.13 runtime pin in vercel.json, a rewritten AGENTS.md) are not part of the member-auth work and were not made in a session I can account for. They stay uncommitted for the user to review.
- Staged only the member-auth files by explicit path rather than using a blanket add.
- Committed locally and did not push, since pushing straight to main was not explicitly requested.
- Noted that an earlier log entry quotes a SECRET_KEY value in plain text and is already on the remote. The log is append-only, so I did not edit it; the user should treat that value as exposed and rotate it if it is used anywhere real.
### Decision-log skill
Before any commit, scan the real files for secrets and review every modified file that the task did not touch. "Commit everything" is not the same as "commit the task". Never quote a credential value in a log or note, even to say it was removed.

## Phase 7: pay-first join
- New public page `web/join.html` and `POST /api/join/checkout/`. No account exists until PayMongo confirms the payment.
- `billing.PendingSignup` (migration 0003) holds name, email, phone, plan and a HASHED password. The webhook (`complete_signup`) creates the login, member profile, payment and active membership.
- `member-portal.html` now redirects to `join.html`. Applications and Track request are gone.
- Staff payments list also shows paid online payments (method ONLINE).
- Members page: new `web/members-ui.css` (loaded after spotify.css) restyles tabs, search, cards, table and enrollment form. No JS changes.
- Join backup path: `PendingSignup.token` (migration 0004), `POST /api/join/confirm/`. On return from PayMongo the server asks PayMongo if the session is paid and creates the account, so it no longer depends only on the webhook.
