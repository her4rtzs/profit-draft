---
date: Unknown
status: accepted
tags: [decision]
---
# `ALLOWED_HOSTS` fails fast when `DEBUG=False` and the value is unset
- Decision: `ALLOWED_HOSTS` fails fast when `DEBUG=False` and the value is unset
- Reason: Refusing to silently fall back to localhost in production
- Trade-offs: Not stated in log
- Evidence: `profit/settings.py` (`ImproperlyConfigured`)

## Related
- None
