# Design Review — ProFit First-Build Scaffold (design.md Revision 3)

**Reviewer:** design-review subagent (fresh context)
**Design under review:** `.agents/tasks/profit-scaffold/design.md` (Revision 3)
**Binding spec:** `AGENTS.md`
**Verdict:** CHANGES_REQUESTED (2 HIGH, 3 MEDIUM, 4 NIT)

The verdict is mechanical: any HIGH or MEDIUM finding blocks. This revision is in good shape — the stack, layout, RBAC matrix, serverless DB flags, and webhook single-writer invariant are all honored, and the authors have been commendably honest about what they could not verify. The blocking findings below are mostly about one unverified claim that is still presented as structurally settled, and a handful of concrete gaps a coder would hit on day one.

---

## Context checked against the live workspace

The workspace is greenfield: it contains only `AGENTS.md`, `Architecture.md`, an empty `PROJECT-LOG.md`, and the `.agents/` task folder. There is no source tree, no `requirements.txt`, no vendored SDKs, and no network access in this authoring pass. That means several of the design's claims are, by construction, unverifiable here — the design acknowledges this for PayMongo (HIGH-1) and `django-components` wiring, which is the right call. The findings below separate "honestly flagged as unverified" (acceptable) from "asserted as settled but actually unverified" (not acceptable).

---

## Findings

### HIGH-1 — The webhook `get_or_create` + `select_for_update` race-safety claim is not actually race-safe as written

**Where:** `apps/billing` section, webhook step 2 ("Idempotency separates 'seen' from 'applied'").

**Problem:** The design states that in a single `transaction.atomic()` block it will "`select_for_update`/`get_or_create` the `WebhookEvent` by `event_id`." These two operations do not compose into the lock the design relies on. `get_or_create` does *not* take a row lock on the created row, and `select_for_update` can only lock a row that already exists. For two concurrent deliveries of the *same new* `event_id`:

- Both call `get_or_create`; the DB `unique(event_id)` constraint lets exactly one `INSERT` win and the other raises `IntegrityError` (not a clean "got existing row"). The design's step-2 branch logic ("if the row is new … continue; if existing PROCESSED/IGNORED … return 200") never describes catching that `IntegrityError`, so the losing request 500s instead of resolving idempotently.
- If instead the row already exists as `UNKNOWN_PAYMENT`, the intended `select_for_update` lock requires a *separate* `SELECT ... FOR UPDATE` query. `get_or_create` under a race returns the existing row without a `FOR UPDATE` lock, so two retries can both pass the "status == UNKNOWN_PAYMENT → continue" gate and both apply the transition.

Either way the described call sequence does not deliver the serialization the race fix depends on, and PayMongo *does* send concurrent redeliveries.

**Concrete fix:** Specify the exact two-step sequence and the error path:

```python
with transaction.atomic():
    event, created = WebhookEvent.objects.get_or_create(
        event_id=event_id, defaults={"status": WebhookEvent.Status.UNKNOWN_PAYMENT}
    )
    if not created:
        # re-read WITH the row lock so concurrent retries serialize
        event = WebhookEvent.objects.select_for_update().get(pk=event.pk)
        if event.status in (Status.PROCESSED, Status.IGNORED):
            return HttpResponse(status=200)   # terminal duplicate
    else:
        # lock the freshly created row before mutating
        event = WebhookEvent.objects.select_for_update().get(pk=event.pk)
    # ... resolve event type, mutate Payment, set event.status, save ...
```

and explicitly state that a concurrent-insert `IntegrityError` on `event_id` is caught and treated as "row now exists → re-read under `select_for_update` and apply the duplicate check." Without the `IntegrityError` catch and the explicit re-`SELECT FOR UPDATE`, the "race fix" is not one.

### HIGH-2 — Signature `mode` selection ("test key vs live key") has no defined derivation and no offline fallback value

**Where:** `apps/billing` webhook step 1 and the `verify_signature(..., *, mode)` helper.

**Problem:** The helper selects `te` in test mode and `li` in live mode, with "mode derived from whether the configured key is a test or live key." But the *configured key* for signature verification is `PAYMONGO_WEBHOOK_SECRET`, whose local-dev fallback is `"whsec_test_dummy"` (per the env table) — a value that encodes no test/live distinction, and PayMongo's `whsec_...` webhook secrets do not carry a `test`/`live` marker the way the API `sk_test_`/`sk_live_` keys do. The design conflates the *API secret key* (`PAYMONGO_SECRET_KEY`, which has `sk_test`/`sk_live` prefixes) with the *webhook signing secret* (`PAYMONGO_WEBHOOK_SECRET`). As written, there is no deterministic way to compute `mode`, and the one unit test ("asserts the signed message is `{t}.{body}`") never pins which of `te`/`li` is compared — so the test can pass while `mode` resolves wrong in production and every live signature is rejected.

**Concrete fix:** Pick one explicit mechanism and state it:
- Derive `mode` from `PAYMONGO_SECRET_KEY`'s prefix (`sk_test_` → test, `sk_live_` → live), not from the webhook secret; and define the offline/empty-key default (e.g. `mode = "test"` when `PAYMONGO_SECRET_KEY` is empty).

and add a unit-test case asserting that in test mode the comparison is against the `te` field (and in live mode against `li`), so the selection itself is guarded, not just the message shape. Because this interacts with the already-flagged unverified scheme (HIGH-1 in the design), note it in the same pre-go-live confirmation task.

### MEDIUM-1 — The "assumed scheme" is honestly flagged, but the design still ships a webhook as in-scope with no fallback contract when confirmation fails

**Where:** `apps/billing` webhook step 1 confirmation-status note; First-build scope item 4.

**Problem:** The design correctly reframes the PayMongo signature scheme as *assumed, pending confirmation* (good — this resolves the prior round's false-verification finding). But scope item 4 still delivers a "concrete PayMongo webhook receiver stub that verifies the signature," and the acceptance gate is `check` + `test` passing offline. The honest caveat and the in-scope deliverable are in tension: the webhook is being built and unit-tested against assumptions, which means the tests encode the guess and will go green, giving a false signal of completeness. There is no stated contract for what happens if, at confirmation time, the real scheme differs structurally (e.g. multiple signatures, a different canonicalization, or JSON that must not be re-decoded). The design says "touches exactly one function and its test fixture," which understates the risk if the real scheme changes the *inputs* (e.g. needs the exact raw bytes without `.decode()`, which `f"{t}.{raw_body.decode()}"` would already have corrupted for non-UTF-8 or re-encoded payloads).

**Concrete fix:** Add one sentence to the webhook section: operate on `raw_body` as `bytes` throughout (sign `t.encode() + b"." + raw_body`, never `raw_body.decode()`), so the verifier is byte-exact regardless of the eventual field details; and state the fallback explicitly — if confirmation reveals a structurally different scheme, `verify_signature` and its fixture are rewritten in the billing pass and no real webhook traffic is accepted until then. This keeps the day-one build honest without pretending the contract is closed.

### MEDIUM-2 — `ALLOWED_HOSTS` production behavior is underspecified and can crash every request

**Where:** Settings & environment table, `ALLOWED_HOSTS` row ("required when `DEBUG=False`").

**Problem:** The table says `ALLOWED_HOSTS` is required when `DEBUG=False` with a local fallback of `["localhost","127.0.0.1"]`, but does not say what happens in production when it is *unset*. On Vercel the inbound Host header is the deployment domain (e.g. `*.vercel.app` and any custom domain). If the design falls back to localhost-only (or empty) when `DEBUG=False`, Django raises `DisallowedHost` (400) on *every* request — the app is dead on arrival. The design nowhere states how the Vercel domain gets into `ALLOWED_HOSTS`.

**Concrete fix:** Specify the production rule: `ALLOWED_HOSTS` is read from the env var (csv) and must include the Vercel production domain and any custom domain; add `.vercel.app` guidance to `.env.example`. State the behavior when unset under `DEBUG=False` (fail fast at startup with a clear `ImproperlyConfigured`, rather than silently falling back to localhost and 400-ing every request). Optionally read `VERCEL_URL` (injected by Vercel) as a convenience default.

### MEDIUM-3 — CSRF-exempt webhook endpoint and `CSRF_COOKIE_SECURE`/session security interplay for the mobile login POST is left as "either/or"

**Where:** `mobile/` Auth section (NIT-2 caveat): the login POST "must either hit a view that supplies/accepts the CSRF token … or be routed through a CSRF-exempt login endpoint created for the device."

**Problem:** This is exactly the "use X or Y" ambiguity the review brief calls out. One screen is in scope and it must authenticate to make the two GET calls work, so the login mechanism is on the critical path — it cannot be left as an unresolved choice. The two options have materially different security postures: a CSRF-exempt login endpoint accepting credentials is a deliberate hole that must be justified, while the CSRF-token-echo path requires a prior GET to obtain the `csrftoken` cookie, which the design does not sequence. As written, a coder cannot build the one in-scope mobile screen without inventing the auth flow.

**Concrete fix:** Pick one. Recommended for a session-auth-only first slice: the mobile client first issues `GET` to a lightweight endpoint that sets the `csrftoken` cookie (Django's `ensure_csrf_cookie`), then `POST`s credentials to the standard login view echoing the token in `X-CSRFToken`, relying on the device cookie jar with `credentials: "include"`. State that no CSRF-exempt login endpoint is created this pass. Document the exact request sequence (GET csrf → POST login → GET /api/membership/me/ → GET /api/attendance/).

### NIT-1 — `django-components==0.100` wiring is pinned but admittedly unverified against that version

**Where:** `requirements.txt` section; Web portal shell section.

**Problem:** The three setup points (INSTALLED_APPS entry, the `template_loader.Loader`, and `COMPONENTS = {"dirs": [...]}`) are stated to be unverifiable against `django-components==0.100` in this workspace, with instructions to confirm during implementation. This is handled responsibly (hard pin, verify-wiring-not-pin), so it is a NIT rather than a blocker — but it is a real unverified assumption the coder must not skip. The `0.100` API shape (dotted `COMPONENTS["dirs"]`, loader path) changed across minor releases of this library.

**Concrete fix:** Keep the pin; add the acceptance check "`python manage.py check` passes with the component rendering in a template" to the implementation task so a wrong loader path fails the gate rather than silently rendering nothing.

### NIT-2 — Startup pooler WARNING check reads `DATABASES["default"]["PORT"]` which may be empty under a URL-parsed config

**Where:** Settings, "Supabase pooler safety" soft check.

**Problem:** `env.db_url` parses `DATABASE_URL` into the `DATABASES` dict, and when the URL omits an explicit port the parsed `PORT` can be `""` (empty string) rather than a numeric `5432`/`6543`. The check "`PORT` is `5432` → warn" then silently never fires for a direct connection that relied on the default port, giving false confidence. Minor because it is only a soft advisory.

**Concrete fix:** Normalize the port before comparing (treat empty as the scheme default) or compare against both `"5432"` and `5432` and `""`; and state that the warning is advisory only.

### NIT-3 — `vercel.json` `rewrites` `"/(.*)"` to `/api/index` vs static asset serving by WhiteNoise is not reconciled

**Where:** `vercel.json` section; Static files section.

**Problem:** The design routes *all* traffic (`"/(.*)"`) into the single Python function and also relies on WhiteNoise to serve `/static/...`. That is internally consistent (WhiteNoise serves static from inside the function), but it means every static asset request pays a cold-start/function-invocation cost rather than being served by Vercel's edge/CDN. Not wrong, and arguably simpler, but worth a sentence so it is a deliberate choice rather than an oversight.

**Concrete fix:** Add one line stating that static files are intentionally served through WhiteNoise inside the function (not Vercel static hosting) for first-build simplicity, and note CDN/static-hosting optimization as a later task.

### NIT-4 — `WebhookEvent` has no stored timestamp ordering guarantee for out-of-order `paid`/`failed` deliveries

**Where:** `apps/billing` webhook step 3.

**Problem:** PayMongo can deliver `payment.failed` and `payment.paid` for the same payment out of order, and each is a distinct `event_id` (so idempotency does not merge them). The design applies whichever event is processed, with no rule for "a terminal `PAID` must not be overwritten by a late `FAILED`" (or vice versa). First-build billing is stubbed so this is low-impact now, but the single-writer mutators will inherit the gap.

**Concrete fix:** Note (even if deferred to the billing pass) that `mark_payment_paid`/`mark_payment_failed` should guard against illegal/stale transitions (e.g. ignore a `failed` arriving after `paid`), so out-of-order redelivery cannot flip a settled payment.

---

## Verified Assumptions

These design claims were checked against the live workspace or are internally sound:

1. **Python 3.13 target.** Verified: `python --version` → `Python 3.13.14`, the only interpreter present. The two-place pin (`vercel.json` runtime `python3.13`, `.python-version` = `3.13`) is consistent and the 3.12 claim is correctly dropped.
2. **Stack lock honored.** The design's stack (Django + DRF serverless on Vercel, Supabase PG via ORM, RN+NativeWind+react-native-reusables+lucide-react-native mobile, Django templates+Tailwind+daisyUI+HTMX+Alpine+django-components+Lucide web, PayMongo, `pg_cron`) matches `AGENTS.md` "Stack" exactly. No framework was added to the web portal; no React on web.
3. **Repo layout.** Matches `AGENTS.md` "Repo layout" with the two documented additions (`api/index.py`, `.python-version`), each justified. `apps/` as a package with dotted `AppConfig.name` + short `label` is sound.
4. **RBAC covers all four roles on both surfaces.** The five-row matrix (Financial / Record payments / Enrollment / Attendance / Own profile) reproduces `AGENTS.md` cell-for-cell for Owner/Cashier/Trainer/Member; shared pure helpers with thin Django-view and DRF adapters enforce server-side on both views and DRF, per the spec. The "Own profile = self only for all roles" correction matches the matrix (no staff-edits-others overreach).
5. **Serverless DB ORM flags.** `DISABLE_SERVER_SIDE_CURSORS = True` and `CONN_MAX_AGE = 0`, applied unconditionally, match `AGENTS.md` "Deployment constraints." The transaction-mode pooler endpoint (port `6543`, distinct from session pooler and direct `5432`) is now specified — this correctly resolves the prior round's gap.
6. **No in-process jobs.** Membership expiry is a `supabase/cron/*.sql` `pg_cron` job, documented as not managed by Django migrations and applied manually — matches `AGENTS.md` "no background workers … use `pg_cron` or webhooks" and the "one exception to everything-through-the-ORM" clause.
7. **WhiteNoise, no local-disk reliance.** Static served via WhiteNoise reading from the bundled, read-only `staticfiles/` produced by a build-time `collectstatic` and shipped via `includeFiles`; Tailwind compiled at build time, no runtime CDN. Matches `AGENTS.md` static-files and "compile Tailwind at build time" rules.
8. **Webhook is the single source of paid/failed.** `mark_payment_paid`/`mark_payment_failed` are the only status writers, called only from the webhook; `can_initiate_payment` governs intent only and never writes status; client redirect is explicitly never trusted. Matches `AGENTS.md` "Payments" rules. (Race-safety of the *mechanism* is the subject of HIGH-1; the single-writer *invariant* itself is correctly designed.)
9. **Idempotency ledger has no orphan states.** `WebhookEvent.status` is exactly `PROCESSED`/`UNKNOWN_PAYMENT`/`IGNORED`, each with a concrete producer; `DEFERRED` and `signature_valid` are correctly removed. Signature-failure writes no row. Internally consistent.
10. **Local-dev offline fallback is real in intent.** SQLite fallback via explicit `default=` on `env.db_url`, security relaxations gated on `DEBUG`, dummy secrets — the design is coherent for an offline `check`/`test`/`runserver`. (The *library behavior* backing it is the subject of the Unverified section below.)
11. **Centavos / timezone / no raw SQL / no-secrets-in-logs / tests-for-billing-auth.** All `AGENTS.md` "Rules" are addressed: integer centavos, `Asia/Manila` via `timezone.localdate()`, ORM-only (sole documented `pg_cron` exception), PII/payment-free logging, and unit tests for RBAC + webhook.

---

## Unverified / Wrong Assumptions

These claims could not be verified in this workspace or are incorrect as stated:

1. **PayMongo signature scheme (header name, `t`/`te`/`li` fields, delimiter, `{t}.{body}` message).** UNVERIFIED — confirmed by file search that no PayMongo SDK, doc, or fixture exists in the workspace and this pass has no network. The design flags this honestly (its HIGH-1) and gates it behind a pre-go-live task. Acceptable as flagged, but see review HIGH-1 (race mechanics) and HIGH-2 (mode selection) and MEDIUM-1 (bytes-exact handling + fallback) for the parts that are *not* purely about the external field names and must be fixed regardless of confirmation.
2. **`django-environ==0.11.2` `Env.db_url(var, default=...)` kwarg and `sqlite://` parsing.** UNVERIFIED — no `environ` package present in-workspace. The offline fallback depends entirely on this behaving as described. Implementation must confirm (and the acceptance gate `python manage.py check` with `DATABASE_URL` unset will catch it).
3. **`django-components==0.100` setup triple (INSTALLED_APPS, `template_loader.Loader`, `COMPONENTS["dirs"]`).** UNVERIFIED — admitted by the design (its NIT-1); no package present. Must be confirmed against that exact version during implementation (review NIT-1).
4. **`@vercel/python` behavior:** that a `buildCommand` running `collectstatic` + `functions.includeFiles` globs (`staticfiles/**` etc.) reliably bundle the build output into the function, and that importing `app` from `api/index.py` with a `"/(.*)"` rewrite serves all routes. UNVERIFIED — no `vercel.json` or deploy artifact exists and there is no network. Plausible and consistent, but it is the riskiest unverified integration and should be validated in a real preview deploy before relying on it.
5. **`mode` derivation for signature selection.** WRONG as stated — deriving test/live from the *webhook secret* (`whsec_...`, which carries no mode marker) is not possible; see review HIGH-2.
