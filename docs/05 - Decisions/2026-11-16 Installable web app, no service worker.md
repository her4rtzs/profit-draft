---
date: 2026-11-16
status: accepted
tags: [decision]
---
# Installable web app with no service worker
- Decision: Make the portal installable with a public manifest, four icons exported from the approved logo, head tags on every page and an instruction-only install card on three role-accessible pages; delete `web/sw.js`, `web/pwa.js` and the static manifest; record the real-phone gate as open.
- Reason: Offline caching of member and payment data on shared front-desk phones is forbidden; no single page is open to every role, so the card lives on staff settings, trainer settings and member home.
- Trade-offs: The first implementation used a Django view for the manifest (reversed in the next entry) and a light `#f0f2f5` theme colour, also reversed the same day; the real-phone install check is still owed by the owner.
- Evidence: `web/sw.js`, `web/pwa.js`, `web/manifest.webmanifest`, `docs/PROGRESS.md`, `ROADMAP.md`, `AGENTS.md`; Source: PROJECT-LOG.md, 2026-11-16 11:00.

## Related
- None
