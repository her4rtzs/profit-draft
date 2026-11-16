# Progress record

Running notes for roadmap steps: what the repo looked like before the change, what was changed, what was checked, and what is still open. `ROADMAP.md` is the checklist; this file is the evidence.

## 2026-11-16 — Phase 4.5: Installable Web App

### Baseline (before any change)

Checked by reading the repo, then confirmed with `python manage.py collectstatic` output.

- A static manifest existed at `web/manifest.webmanifest` with icons in `web/icons/` (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`) — real PNGs, 24-bit RGB, correct sizes, but no `id`, relative URLs, and background `#0b1220`.
- A service worker existed: `web/sw.js` (offline app shell cache) registered by `web/pwa.js` from the staff pages. The step forbids both.
- `theme-color` existed on 14 pages with four different values that are not portal colours: `#0d9488`, `#0b0b0d`, `#07080c`, `#0A0E17`.
- 14 of 28 pages had no manifest link at all: `login`, `join`, `forgot`, `welcome`, `member-portal`, `trainer-portal` and all eight `trainer/*` pages.
- No `apple-touch-icon`.
- Portal colours are in `web/styles.css:17` (light `--bg:#f0f2f5`) and `:56` (dark `--bg:#18191a`); the accent is gold `#e8b93a`. The dark theme is chosen by the user and stored in `localStorage`, not taken from the operating system — hence **one** theme colour, not two.
- Two surfaces: `templates/base.html` (a real shared `{% block %}` head) and the static pages in `web/`, which are standalone files with no shared partial. Both had to carry the tags.
- Static files: WhiteNoise with `CompressedManifestStaticFilesStorage` (`staticfiles/` + `web/` via `WHITENOISE_ROOT`). Hashed names mean icon URLs must be built with `static()`.
- No middleware forces login on every URL, and nothing adds `Cache-Control: no-store`, so nothing had to be excluded for the manifest.
- No page is open to every role: `web/settings.html` and `web/profile.html` are staff-only, members only get `member-home.html`, trainers use `web/trainer/`. The card therefore went on three pages instead of one.

### What was changed

- `profit/views.py`: public `manifest` view (`id`/`start_url`/`scope` = `/`, name/short_name `ProFit`, `standalone`, `#f0f2f5` theme and background, no orientation lock, icon URLs from `static()`), served as `application/manifest+json`. Routed at `/manifest.webmanifest` in `profit/urls.py`.
- `profit/settings.py`: `static/icons` and `static/js` added to `STATICFILES_DIRS` as prefixed entries, so the URLs are `/static/icons/...` and `/static/js/...`. Verified by a real `collectstatic`: the files land in `staticfiles/icons/` and `staticfiles/js/` with hashed names.
- `static/icons/`: `icon-192.png`, `icon-512.png`, `maskable-icon-512.png`, `apple-touch-icon.png`, all exported from the approved `web/logo.jpg` (centre crop on the dark portal background `#0a0e17`; maskable art kept inside the middle 80%). 8-bit, colour type 2 (RGB), no alpha. No image library was added.
- `templates/base.html` and all 27 `web/**/*.html` pages: one canonical block of manifest link, one `theme-color`, the Apple touch icon and the three Apple web-app meta tags. Old `theme-color` tags and `pwa.js` tags were removed.
- `static/js/install-help.js`: changes the card text from "Checking..." to either "You're using the installed app." or the steps, using `(display-mode: standalone)`, `navigator.standalone` and a display-mode change listener. No `serviceWorker`, no `beforeinstallprompt`, no install button.
- Install card added to `web/settings.html`, `web/trainer/settings.html`, `web/member-home.html`.
- Deleted `web/sw.js`, `web/pwa.js`, `web/manifest.webmanifest`. A file at `web/manifest.webmanifest` would otherwise shadow the Django route, because `WHITENOISE_ROOT` serves `web/` at the site root.
- Tests: `profit/tests/test_installable.py` (9 tests).

### Checks run

- `python manage.py test` → 205 tests, OK (8 of them new).
- `python manage.py check` → 1 pre-existing warning: `static/dist` does not exist locally because `app.css` is only built by the Vercel build. Not caused by this step.
- `ruff check profit/views.py profit/urls.py profit/tests/` → clean. `ruff check .` on the whole repo → 185 errors **before and after** this step; the repo has no ruff configuration file, so the default rule set flags long-standing code (`profit/settings.py` alone has `import sys` above the docstring and an unused `noqa`). No new errors were introduced; a repo-wide lint pass is a separate decision.
- Not run: the real-phone gate. Install only works on the deployed HTTPS site, so it is the owner's manual check.

### Deviations and notes

- Install card on three pages, not one shared partial: the portal has no single page every role can open.
- One `theme-color` (`#f0f2f5`) because the theme is a user setting, not an OS setting. A phone in dark mode may briefly show a light launch splash — accepted.
- `web/` pages hard-code `/static/icons/apple-touch-icon.png` and `/static/js/install-help.js` because they are plain HTML with no template tags. Only the Django pages and the manifest use `static()` / `{% static %}`.

### Still open

- Owner phone checklist in `ROADMAP.md` Phase 4.5 (iPhone Safari and Android Chrome, roles, sign-out, deactivated account, installed-card text).
