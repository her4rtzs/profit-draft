"""daisyUI button component.

Usage:
    {% component "button" label="Save" variant="primary" %}{% endcomponent %}
"""

from django_components import Component, register


@register("button")
class Button(Component):
    template_name = "button.html"

    def get_context_data(self, label="", variant="primary", type="button", extra_classes=""):
        return {
            "label": label,
            "variant": variant,
            "type": type,
            "extra_classes": extra_classes,
        }
