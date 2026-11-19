---
date: 2026-10-29
status: accepted
tags: [decision]
---
# Skeleton loaders live in the real HTML containers
- Decision: Put skeletons in the actual list containers rather than injecting them from script; give the handover a short minimum and a hard fallback; delete the old copy of a style in the same commit as moving it to a shared file.
- Reason: The first render then replaces the placeholder in place so the layout never jumps; a fast failure otherwise leaves the placeholder looking permanent; a duplicate style copy silently misses a page on the next theme fix.
- Trade-offs: Not stated in log
- Evidence: Source: PROJECT-LOG.md, 2026-10-29 17:00.

## Related
- None
