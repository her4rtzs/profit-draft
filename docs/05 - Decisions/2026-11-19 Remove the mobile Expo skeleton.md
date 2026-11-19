---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Remove the mobile Expo skeleton
- Decision: Delete `mobile/` (13 files) with `git rm -r`, drop `mobile/**` from `vercel.json` excludeFiles, mark ROADMAP Phase 5 removed, and reword README, Architecture, the vault fact files and code docstrings to describe one installable web portal.
- Reason: `AGENTS.md:30` says there is no native mobile app. The installable web portal in Phase 4.5 is the phone route, so the Expo skeleton was dead code that still promised a second client.
- Trade-offs: Historical records were left untouched: `PROJECT-LOG.md`, `.agents/tasks/profit-scaffold/*`, existing decision notes and the tracked `profit-updated.zip` still contain old mobile references. The zip retains an old copy of the folder.
- Evidence: `git rm -r mobile` (13 tracked files), `vercel.json:5`, `ROADMAP.md` Phase 5, `AGENTS.md:30`, `Architecture.md:138`; `manage.py check` and the full test suite were re-run after the deletion.

## Related
- [[2026-11-16 Installable web app, no service worker]]
- [[Unknown Session and CSRF auth only]]
