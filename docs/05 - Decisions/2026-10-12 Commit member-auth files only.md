---
date: 2026-10-12
status: accepted
tags: [decision]
---
# Commit only the member-auth files; withhold unsafe and unrelated files
- Decision: Stage by explicit path; unstage `.env.example` because it held real-looking Supabase credentials and a project URL; leave the unaccounted-for edits to `AGENTS.md` and `vercel.json` out; commit locally without pushing.
- Reason: A secret in git history is not removed by deleting it later, and "commit everything" is not the same as "commit the task".
- Trade-offs: The unrelated local edits stayed uncommitted for owner review; pushing straight to `main` was not done without an explicit request.
- Evidence: `.env.example`, `AGENTS.md`, `vercel.json`; Source: PROJECT-LOG.md, 2026-10-12 10:20.

## Related
- None
