---
date: Unknown
status: accepted
tags: [decision]
---
# `web/` is served at the site root by WhiteNoise, same origin as `/api`
- Decision: `web/` is served at the site root by WhiteNoise, same origin as `/api`
- Reason: Pages, manifest, service worker and cookies share one origin: no CORS
- Trade-offs: Not stated in log
- Evidence: `profit/settings.py` (`WHITENOISE_ROOT`, comment above it)

## Related
- None
