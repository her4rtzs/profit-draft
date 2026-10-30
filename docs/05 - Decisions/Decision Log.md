# Decision Log

Only decisions with evidence in the repository are listed. "Unknown" in the Date column means the repository does not record when the decision was taken.

| Date | Decision | Rationale | Status | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-30 | Every staff list row becomes a card under 768 px instead of a scrolling table | The columns never fit a phone; sideways scrolling hid information | Shipped | commit `00072d4`; `web/staff-design.css` mobile block comment |
| 2026-10-30 | `members.html` reuses its existing Cards view on phones instead of restyling its table twice | Avoids a second card implementation for the same data | Shipped | commit `00072d4`; `web/members.js` (`matchMedia` view switch) |
| Unknown | PayMongo **Checkout Sessions** are used rather than payment intents | Hosted checkout keeps the client out of card/wallet handling | Shipped | `apps/billing/services.py` (`PAYMONGO_CHECKOUT_URL = ".../v1/checkout_sessions"`), `ROADMAP.md` phase 3 |
| Unknown | Pay-first join: a person paying to join has **no account** until the webhook confirms; only a `PendingSignup` row exists | Nothing is created for an unpaid visitor, and the account exists only after confirmed money | Shipped | `apps/billing/models.py` (`PendingSignup` docstring), `apps/billing/services.py` (`create_join_checkout`, `complete_signup`) |
| Unknown | Desk payments live in `finance.ManualPayment`, separate from `billing.Payment` | `billing.Payment.status` is written only by the PayMongo webhook; a desk payment is settled the moment staff record it | Shipped | `apps/finance/models.py` (`ManualPayment` docstring) |
| Unknown | Member photo is a base64 data URL in `MemberProfile.photo_data`, not Supabase Storage | Supabase Storage wiring was deferred | Deviation, open | `apps/membership/models.py` (`photo_data`), `ROADMAP.md` phase 2 |
| Unknown | PayMongo runs in **test mode only**; methods come from `PAYMONGO_PAYMENT_METHODS` | No live keys or real money; enabling a method is configuration, not code | Accepted | `Architecture.md` §13; `profit/settings.py` |
| Unknown | Local development falls back to SQLite when `DATABASE_URL` is unset | Lets the app run fully offline without a live Supabase connection | Shipped | `profit/settings.py` (`env.db_url` default), `README.md` line 80 |
| Unknown | `web/` is served at the site root by WhiteNoise, same origin as `/api` | Pages, manifest, service worker and cookies share one origin: no CORS | Shipped | `profit/settings.py` (`WHITENOISE_ROOT`, comment above it) |
| Unknown | Mobile and web clients use Django **session + CSRF** auth only; no token endpoint and no CSRF-exempt login | One auth path for both surfaces; CSRF stays enforced on the login POST | Accepted ("BINDING") | `profit/settings.py` (`REST_FRAMEWORK` `SessionAuthentication`), `mobile/README.md` lines 35–41 |
| Unknown | `DEBUG` defaults to **off** | With debug on, secure-cookie and HTTPS-proxy handling were skipped and the login POST failed CSRF checks | Fixed | `AUDIT.md` bug 1 ("default is now off"); `profit/settings.py` (`env.bool("DEBUG", default=False)`) |
| Unknown | `ALLOWED_HOSTS` fails fast when `DEBUG=False` and the value is unset | Refusing to silently fall back to localhost in production | Shipped | `profit/settings.py` (`ImproperlyConfigured`) |
