---
date: Unknown
status: accepted
tags: [decision]
---
# Mobile and web clients use Django session + CSRF auth only
- Decision: Mobile and web clients use Django **session + CSRF** auth only; no token endpoint and no CSRF-exempt login
- Reason: One auth path for both surfaces; CSRF stays enforced on the login POST
- Trade-offs: Not stated in log
- Evidence: `profit/settings.py` (`REST_FRAMEWORK` `SessionAuthentication`), `mobile/README.md` lines 35–41

## Related
- None
