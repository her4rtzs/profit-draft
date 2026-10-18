"""Lucide icon component — inlines a vendored SVG (no runtime CDN, no JS).

Usage:
    {% component "icon" name="user" %}{% endcomponent %}

Reads static/vendor/lucide/<name>.svg at render time and inlines its markup.
An unknown name renders nothing rather than raising, so a missing icon never
500s a page.
"""

from django.conf import settings
from django.utils.safestring import mark_safe

from django_components import Component, register

LUCIDE_DIR = settings.BASE_DIR / "static" / "vendor" / "lucide"
# Allow only safe filename characters so ``name`` can never traverse paths.
_ALLOWED = set("abcdefghijklmnopqrstuvwxyz0123456789-")


@register("icon")
class Icon(Component):
    template_name = "icon.html"

    def get_context_data(self, name="", css_class=""):
        return {"svg": _load_svg(name), "css_class": css_class}


def _load_svg(name):
    """Return the inlined SVG markup for ``name``, or empty for unknown names."""
    if not name or any(ch not in _ALLOWED for ch in name):
        return mark_safe("")
    path = LUCIDE_DIR / f"{name}.svg"
    if not path.is_file():
        return mark_safe("")
    return mark_safe(path.read_text(encoding="utf-8"))
