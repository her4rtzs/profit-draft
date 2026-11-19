---
date: 2026-11-16
status: accepted
tags: [decision]
---
# Manifest becomes a static file with the dark chrome colour
- Decision: Serve `web/manifest.webmanifest` as a static file instead of a Django view, register `.webmanifest` as `application/manifest+json` in `WHITENOISE_MIMETYPES`, set `theme_color` / `background_color` / `theme-color` to `#0a0e17`, and test every `web/**/*.html` head rather than one page.
- Reason: `WHITENOISE_ROOT = web` already serves that folder at the site root, so the view and route were pure extra code; Python's `mimetypes` does not know the extension, so WhiteNoise would otherwise send octet-stream; the dark chrome matches the launch splash and the icons.
- Trade-offs: A static manifest needs no template but depends on the file staying in `web/`; a light-theme user briefly sees a dark launch splash.
- Evidence: `web/manifest.webmanifest`, `WHITENOISE_MIMETYPES`; Source: PROJECT-LOG.md, 2026-11-16 12:10.

## Related
- [[2026-11-16 Installable web app, no service worker]]
