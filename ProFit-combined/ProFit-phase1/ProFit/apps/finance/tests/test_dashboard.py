"""Access-gate smoke tests for the Owner-only financial dashboard."""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.accounts.models import Role

User = get_user_model()

DASHBOARD_URL = "/finance/"

# The production staticfiles backend is WhiteNoise's manifest storage, which
# needs a `collectstatic` manifest on disk (a deploy artifact, absent offline).
# Rendering base.html would otherwise fail a {% static %} manifest lookup. Swap
# in the plain storage for these tests so the gate itself is what's exercised.
_TEST_STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
    },
}


@override_settings(STORAGES=_TEST_STORAGES)
class FinancialDashboardGateTests(TestCase):
    def test_anonymous_redirects_to_login(self):
        resp = self.client.get(DASHBOARD_URL)
        self.assertEqual(resp.status_code, 302)
        self.assertIn("/accounts/login/", resp.url)

    def test_non_owner_role_is_forbidden(self):
        cashier = User.objects.create_user(
            username="cashier", password="x", role=Role.CASHIER
        )
        self.client.force_login(cashier)
        resp = self.client.get(DASHBOARD_URL)
        self.assertEqual(resp.status_code, 403)

    def test_owner_sees_dashboard(self):
        owner = User.objects.create_user(
            username="owner", password="x", role=Role.OWNER
        )
        self.client.force_login(owner)
        resp = self.client.get(DASHBOARD_URL)
        self.assertEqual(resp.status_code, 200)
