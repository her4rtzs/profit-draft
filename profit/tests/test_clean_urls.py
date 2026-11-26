"""Clean, extensionless URLs and anonymous access rules for static web/ pages."""

from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase, override_settings
from django.urls import reverse


@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class CleanUrlTests(SimpleTestCase):
    def test_landing_page_at_root_has_no_html_in_url(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Functional Fitness Gym", response.content)

    def test_public_pages_serve_at_extensionless_urls(self):
        for url in ("/login", "/join", "/faq", "/terms", "/privacy"):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Content-Type"], "text/html; charset=utf-8")

    def test_protected_pages_redirect_anonymous_users_to_login(self):
        for url in (
            "/dashboard",
            "/index",
            "/cashier",
            "/member-home",
            "/members",
            "/settings",
            "/trainer/index",
            "/trainer/attendance",
            "/trainer/settings",
        ):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 302)
                self.assertTrue(response.url.startswith("/login?next="))

    def test_unknown_page_is_404(self):
        self.assertEqual(self.client.get("/does-not-exist").status_code, 404)
        self.assertEqual(self.client.get("/trainer/does-not-exist").status_code, 404)

    def test_no_static_html_links_remain_in_web_pages(self):
        import re

        pattern = re.compile(r'["\'](?:\.\./|/)?[a-z0-9_/-]+\.html')
        for page in Path(settings.BASE_DIR, "web").rglob("*.html"):
            with self.subTest(page=page.name):
                self.assertFalse(pattern.search(page.read_text(encoding="utf-8", errors="replace")))

    def test_reverse_names(self):
        self.assertEqual(reverse("dashboard"), "/dashboard")
        self.assertEqual(reverse("web-page", kwargs={"page": "login"}), "/login")
        self.assertEqual(
            reverse("web-page-group", kwargs={"group": "trainer", "page": "attendance"}),
            "/trainer/attendance",
        )
