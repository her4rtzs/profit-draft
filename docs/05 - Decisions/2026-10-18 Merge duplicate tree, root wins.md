---
date: 2026-10-18
status: accepted
tags: [decision]
---
# Merge the duplicate repo tree with the root as winner
- Decision: Back up the two append-only files before pulling, fast-forward `8087505` → `0953a92`, choose the root tree as canonical, port only the password-reset files and `web/forgot.html` from `ProFit-combined/`, merge both `PROJECT-LOG.md` copies, then delete the duplicate tree.
- Reason: `AGENTS.md` places the project at the repo root; comparing blob hashes gave the exact list of genuinely missing files; an alternative implementation of something the root already has belongs in git history.
- Trade-offs: `web/early.js`, `web/sidebar-drawing.css`, `web/view-toggle.js` and 29 other differing web files were left behind, recoverable at `c17f620`.
- Evidence: `8087505`, `0953a92`, `c17f620`, `ProFit-combined/`, `web/forgot.html`; Source: PROJECT-LOG.md, 2026-10-18 16:10 and 17:05.

## Related
- None
