---
date: 2026-10-07
status: accepted
tags: [decision]
---
# Django scaffold tuned for the in-repo virtualenv and fail-fast settings
- Decision: Turn off `django-components` autodiscovery, declare the `TEMPLATES` loader chain explicitly, keep `DISABLE_SERVER_SIDE_CURSORS=True` and `CONN_MAX_AGE=0` unconditional, and raise `ImproperlyConfigured` when `DEBUG=False` with no `ALLOWED_HOSTS`.
- Reason: Autodiscovery walked the `.venv` under `BASE_DIR` and crashed on a relative import; `APP_DIRS` cannot be combined with a custom loader. Fail-fast stops a production start from silently falling back to localhost.
- Trade-offs: Components must be registered explicitly in a later FEAT instead of being discovered automatically; no components existed yet, so nothing was lost at the time.
- Evidence: Source: PROJECT-LOG.md, 2026-10-07 20:39.

## Related
- None
