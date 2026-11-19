---
date: Unknown
status: accepted
tags: [decision]
---
# Local development falls back to SQLite when `DATABASE_URL` is unset
- Decision: Local development falls back to SQLite when `DATABASE_URL` is unset
- Reason: Lets the app run fully offline without a live Supabase connection
- Trade-offs: Not stated in log
- Evidence: `profit/settings.py` (`env.db_url` default), `README.md` line 80

## Related
- None
