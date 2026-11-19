---
date: 2026-11-12
status: accepted
tags: [decision]
---
# Workspace source restored to 1090e89
- Decision: Check out all 32 codebase files from commit `1090e89` while keeping `PROJECT-LOG.md` append-only.
- Reason: The owner asked to restore that exact historical version.
- Trade-offs: Everything built after that commit was discarded from the working tree; the log was preserved.
- Evidence: `1090e89`, `git checkout 1090e89 -- .`, `PROJECT-LOG.md`; Source: PROJECT-LOG.md, 2026-11-12 01:52.

## Related
- None
