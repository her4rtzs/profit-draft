---
date: 2026-10-10
status: accepted
tags: [decision]
---
# Custom email-OTP auth instead of a third-party package
- Decision: Build member login/signup/verify as plain Django views; send OTP email through `urllib` to Resend (no new dependency), with a console fallback only when `RESEND_API_KEY` is unset and `DEBUG=True` and a hard failure when unset with `DEBUG=False`; store OTP codes and invite tokens as Argon2 hashes, single-use, capped at 5 attempts, 10-minute expiry, 60-second resend cooldown; ship the Owner invite path as a management command.
- Reason: Anonymous POSTs must be CSRF-protected by middleware; the standard library avoids a new dependency; production must never print OTPs; hashed, capped codes limit abuse; the invitee must never choose a role.
- Trade-offs: The Owner dashboard UI for invites was deferred; ruff was installed into `.venv` only, not added to `requirements.txt`, and linting stayed scoped to touched files.
- Evidence: `urllib`, `make_password` / `check_password`, `ruff==0.9.6` in `.venv`; Source: PROJECT-LOG.md, 2026-10-10 19:45.

## Related
- None
