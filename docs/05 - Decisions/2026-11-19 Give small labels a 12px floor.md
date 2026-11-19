---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Give small labels a 12px floor
- Decision: Raise every 10.5px declaration under `web/` to 12px for functional labels, and keep 11px only for two decorative kickers (`.pp-banner-kicker`, `.portal-kicker`).
- Reason: Functional labels at 10.5px were below the 11px minimum; fix-layer duplicates meant 27 declarations rather than the audit's 23 labels.
- Trade-offs: Some labels sit inside fixed 18px count badges (`.badge-dot`, `.tr-rec-badge`) and may clip at two-digit counts; roughly 60 other 9-10px declarations were left out of scope.
- Evidence: 27 declarations across 8 files: `web/assets/css/staff.css`, `web/staff-design.css`, `web/trainer/trainer.css`, `web/join.html`, `web/member-shell.css`, `web/sidebar-pro.css`, `web/portal-ui.css`, `web/spotify.css`. No `10.5px` remains under `web/`; `impeccable detect --scope type` has no size findings.

## Related
- None
