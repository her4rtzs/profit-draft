import xml.etree.ElementTree as ET
from urllib.parse import urlsplit

from django.contrib.auth import get_user_model
from django.test import Client, TestCase


class SEOTests(TestCase):
    def test_robots_txt_allows_everything_except_api(self):
        res = self.client.get("/robots.txt")
        self.assertEqual(res.status_code, 200)
        body = b"".join(res.streaming_content)
        self.assertIn(b"Allow: /", body)
        self.assertIn(b"Disallow: /api/", body)
        self.assertIn(b"Sitemap: https://functionalfitnessgym.site/sitemap.xml", body)

    def test_sitemap_urls_are_public_canonical_and_indexable(self):
        res = self.client.get("/sitemap.xml")
        self.assertEqual(res.status_code, 200)
        body = b"".join(res.streaming_content)
        root = ET.fromstring(body)
        locs = [node.text for node in root.iter() if node.tag.endswith("loc")]
        self.assertEqual(len(locs), 5)
        for loc in locs:
            with self.subTest(loc=loc):
                self.assertTrue(loc.startswith("https://functionalfitnessgym.site"))
                page = self.client.get(urlsplit(loc).path or "/")
                self.assertEqual(page.status_code, 200)
                self.assertNotIn("X-Robots-Tag", page)
                self.assertIn(f'<link rel="canonical" href="{loc}">'.encode(), page.content)

    def test_welcome_redirects_to_root(self):
        res = self.client.get("/welcome")
        self.assertRedirects(res, "/", status_code=301, fetch_redirect_response=False)

    def test_private_pages_are_noindex(self):
        for path in ("/login", "/forgot"):
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res["X-Robots-Tag"], "noindex, nofollow")

        user = get_user_model().objects.create_user(
            username="seo-owner", password="pw-12345", role="OWNER"
        )
        staff_client = Client()
        staff_client.force_login(user)
        for path in ("/settings", "/payments"):
            with self.subTest(path=path):
                res = staff_client.get(path)
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res["X-Robots-Tag"], "noindex, nofollow")

    def test_raw_html_urls_go_through_django(self):
        self.assertRedirects(
            self.client.get("/login.html"), "/login", fetch_redirect_response=False
        )
