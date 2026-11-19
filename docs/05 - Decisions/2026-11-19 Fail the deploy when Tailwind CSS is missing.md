---
date: 2026-11-19
status: accepted
tags: [decision]
---
# Fail the deploy when Tailwind CSS is missing
- Decision: Register a `staticfiles`-tagged Django system check that errors (`profit.E001`) during `collectstatic` when the compiled `app.css` is missing or empty. It is gated on `collectstatic` being in `sys.argv` so local `check`/`test`/`runserver` stay green.
- Reason: `collectstatic` succeeds even if the Tailwind build produced no `app.css` (other static files exist), so a broken build would deploy and then 500 on every page's `{% static 'app.css' %}` manifest lookup. Turning "the stylesheet was emitted" into a build-gating check makes the failure loud at deploy time instead of at request time.
- Trade-offs: The check depends on `sys.argv`, so a programmatic `call_command("collectstatic")` is not gated (only the Vercel build command path is). Local `collectstatic` now also requires `npm --prefix static/src run build` first — which was already the documented workflow.
- Evidence: `profit/checks.py` (new), `profit/settings.py` (one import to register the check), `profit/tests/test_static_build.py` (4 tests, all pass). Manual: ran the Tailwind build (emitted `static/dist/app.css`, 39 KB) and `collectstatic` (copied it to `staticfiles/app.css`); temporarily hiding the file made `collectstatic` exit 1 with `(profit.E001)`, then restored it. `python manage.py check` = 0 issues.
## Related
- [[Unknown web served at root by WhiteNoise]]
- [[2026-11-14 Serverless deploy keeps migrations out]]
