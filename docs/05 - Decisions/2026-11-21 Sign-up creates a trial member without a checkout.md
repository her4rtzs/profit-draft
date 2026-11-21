---
date: 2026-11-21
status: accepted
tags: [decision]
---
# Sign-up creates a trial member without a checkout
- Decision: The public join sign-up now calls `membership.services.register_trial_member`, which reuses `create_member` (role hardcoded to `MEMBER`) and `start_trial`. `POST /api/join/checkout/` no longer calls `create_join_checkout`; it returns `{"status": "trial", "login_url": ...}` and the page goes to the login screen. The PayMongo functions, webhook, and `JoinConfirmView` stay in place but sign-up does not use them.
- Reason: A free trial cannot wait for a payment, and reusing `create_member` keeps one account-creation path with the existing password and email validation. The role is set inside the service, so a `role` value in the request is ignored.
- Trade-offs: `/join` creates an active login without email verification; the separate `/accounts/signup/` OTP flow is unchanged and still does not create a profile. The join page's plan picker is ignored until the GCash/cash payment flow lands, and its remaining PayMongo copy is deferred.
- Evidence: `api/join.py`, `apps/membership/services.py`, `web/join.html`, `web/login.html`, `apps/billing/tests/test_checkout.py`. `python manage.py test` passed 249 tests. Migration `0005` is still not applied.

## Related
- [[2026-11-21 Free sign-up with a seven-day trial]]
- [[2026-11-21 Trial status with a server-set end date]]
