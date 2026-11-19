---
date: Unknown
status: accepted
tags: [decision]
---
# `DEBUG` defaults to off
- Decision: `DEBUG` defaults to **off**
- Reason: With debug on, secure-cookie and HTTPS-proxy handling were skipped and the login POST failed CSRF checks
- Trade-offs: Not stated in log
- Evidence: `AUDIT.md` bug 1 ("default is now off"); `profit/settings.py` (`env.bool("DEBUG", default=False)`)

## Related
- None
