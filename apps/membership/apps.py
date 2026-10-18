from django.apps import AppConfig


class MembershipConfig(AppConfig):
    name = "apps.membership"
    label = "membership"

    def ready(self):
        # Register the system check that proves the django-component renders.
        from . import checks  # noqa: F401
