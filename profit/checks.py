"""Deploy-time guard for the compiled Tailwind stylesheet.

``collectstatic`` succeeds even when the Tailwind build never produced
``app.css`` (other static files exist), so a broken build would deploy a site
whose pages 500 on ``{% static 'app.css' %}`` manifest lookup. This check turns
"the stylesheet was emitted" into a build-gating error: it runs only during
``collectstatic`` (the Vercel build step) and fails loudly when the compiled
file is missing or empty.
"""

import sys
from pathlib import Path

from django.contrib.staticfiles import finders
from django.core.checks import Error, Tags, register


@register(Tags.staticfiles)
def app_css_built_check(app_configs, **kwargs):
    """Fail the deploy build when the compiled Tailwind CSS is absent."""
    # Local ``manage.py check`` / ``test`` must stay green: static/dist is a
    # git-ignored build artifact that only exists on the deploy builder.
    if "collectstatic" not in sys.argv:
        return []

    built = finders.find("app.css")
    if not built or not Path(built).is_file() or Path(built).stat().st_size == 0:
        return [
            Error(
                "The Tailwind build did not emit app.css (expected "
                "static/dist/app.css). Run `npm --prefix static/src run build` "
                "before collectstatic so the deploy has a stylesheet.",
                id="profit.E001",
            )
        ]
    return []
