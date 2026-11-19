---
date: 2026-11-13
status: accepted
tags: [decision]
---
# Diverged master branches merged with both logs kept
- Decision: Merge local `master` (revenue chart year selector) with `origin/master` (`5a73caa`, sidebar z-index), keep both sides' `PROJECT-LOG.md` entries in chronological order, then commit `248f632` and push.
- Reason: The branches had diverged; the append-only log is the file that conflicts most often and no session record may be dropped.
- Trade-offs: Not stated in log
- Evidence: `5a73caa`, `248f632`, `PROJECT-LOG.md`, 45 + 8 tests OK; Source: PROJECT-LOG.md, 2026-11-13 20:25.

## Related
- None
