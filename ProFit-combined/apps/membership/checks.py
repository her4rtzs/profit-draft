"""System check proving the django-components wiring actually renders.

``python manage.py check`` runs this. It renders the example ``button``
component to a string and fails the gate (Error ``membership.E001``) if the
output is empty — which is what a wrong ``django-components==0.100`` loader path
would produce. This turns "the component renders" into an enforced check rather
than a manual claim.
"""

from django.core.checks import Error, register
from django.template import Context, Template


@register()
def component_renders_check(app_configs, **kwargs):
    errors = []
    try:
        template = Template(
            '{% load component_tags %}'
            '{% component "button" label="Save" variant="primary" %}'
            "{% endcomponent %}"
        )
        rendered = template.render(Context({})).strip()
    except Exception as exc:  # noqa: BLE001 - surface any wiring failure as a check error
        errors.append(
            Error(
                f"Rendering the example django-component failed: {exc!r}",
                id="membership.E001",
            )
        )
        return errors

    if not rendered:
        errors.append(
            Error(
                "The example django-component rendered to empty output; the "
                "django-components loader is likely misconfigured.",
                id="membership.E001",
            )
        )
    return errors
