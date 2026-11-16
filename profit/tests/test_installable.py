"""Installable-app tests: manifest, icons, head tags, install card, no service worker."""

import json
import struct

from django.conf import settings
from django.templatetags.static import static
from django.test import TestCase, override_settings

WEB = settings.BASE_DIR / "web"
ICON_DIR = settings.BASE_DIR / "static" / "icons"

ICONS = {
    "icon-192.png": 192,
    "icon-512.png": 512,
    "maskable-icon-512.png": 512,
    "apple-touch-icon.png": 180,
}

# collectstatic builds the hashed names in production; tests use the plain storage
# so nothing depends on a pre-built staticfiles.json.
_PLAIN_STATIC = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@override_settings(STORAGES=_PLAIN_STATIC)
class ManifestTests(TestCase):
    def test_anonymous_client_gets_manifest(self):
        response = self.client.get("/manifest.webmanifest")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            response["Content-Type"].startswith("application/manifest+json"),
            response["Content-Type"],
        )

    def test_manifest_contract(self):
        data = json.loads(self.client.get("/manifest.webmanifest").content)
        self.assertEqual(data["id"], "/")
        self.assertEqual(data["start_url"], "/")
        self.assertEqual(data["scope"], "/")
        self.assertEqual(data["name"], "ProFit")
        self.assertEqual(data["short_name"], "ProFit")
        self.assertEqual(data["display"], "standalone")
        self.assertEqual(data["theme_color"], "#f0f2f5")
        self.assertEqual(data["background_color"], "#f0f2f5")
        self.assertNotIn("orientation", data)

        icons = {icon["src"]: icon for icon in data["icons"]}
        self.assertEqual(
            icons[static("icons/icon-192.png")]["sizes"], "192x192"
        )
        self.assertEqual(
            icons[static("icons/icon-512.png")]["sizes"], "512x512"
        )
        maskable = icons[static("icons/maskable-icon-512.png")]
        self.assertEqual(maskable["sizes"], "512x512")
        self.assertEqual(maskable["purpose"], "maskable")
        for icon in data["icons"]:
            self.assertEqual(icon["type"], "image/png")


class IconTests(TestCase):
    def test_icons_exist_and_are_rgb_pngs(self):
        for name, size in ICONS.items():
            path = ICON_DIR / name
            self.assertTrue(path.exists(), f"static/icons/{name} is missing")
            with open(path, "rb") as handle:
                head = handle.read(26)
            self.assertEqual(head[:8], b"\x89PNG\r\n\x1a\n", f"{name} is not a PNG")
            width, height = struct.unpack(">II", head[16:24])
            self.assertEqual((width, height), (size, size), name)
            self.assertEqual(head[24], 8, f"{name} is not 8-bit")
            # PNG colour type 2 = RGB, i.e. no alpha channel.
            self.assertEqual(head[25], 2, f"{name} has an alpha channel")


@override_settings(STORAGES=_PLAIN_STATIC)
class HeadTagTests(TestCase):
    def test_login_page_head_has_install_tags(self):
        html = self.client.get("/accounts/login/").content.decode()
        self.assertIn('rel="manifest"', html)
        self.assertIn('href="/manifest.webmanifest"', html)
        self.assertIn('<meta name="theme-color" content="#f0f2f5"', html)
        self.assertIn('rel="apple-touch-icon"', html)
        self.assertIn("/static/icons/apple-touch-icon.png", html)
        self.assertIn(
            '<meta name="apple-mobile-web-app-capable" content="yes"', html
        )
        self.assertIn('<meta name="apple-mobile-web-app-title" content="ProFit"', html)
        self.assertIn('name="apple-mobile-web-app-status-bar-style"', html)


CARD_PAGES = (
    WEB / "settings.html",
    WEB / "trainer" / "settings.html",
    WEB / "member-home.html",
)


class InstallCardTests(TestCase):
    def test_card_renders_instructions(self):
        for page in CARD_PAGES:
            html = page.read_text(encoding="utf-8", errors="surrogateescape")
            self.assertIn("Install the app", html, page.name)
            self.assertIn('id="installHelpStatus"', html, page.name)
            self.assertIn("Checking...", html, page.name)
            self.assertIn("data-install-steps", html, page.name)
            self.assertIn("Add to Home Screen", html, page.name)
            self.assertIn("Install app", html, page.name)
            self.assertIn("/static/js/install-help.js", html, page.name)

    def test_install_script_has_no_install_prompt_or_service_worker(self):
        source = (settings.BASE_DIR / "static" / "js" / "install-help.js").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("serviceWorker", source)
        self.assertNotIn("beforeinstallprompt", source)
        self.assertIn("(display-mode: standalone)", source)
        self.assertIn("standalone", source)
        self.assertIn("addEventListener", source)


class NoServiceWorkerTests(TestCase):
    def test_no_service_worker_files(self):
        for name in ("sw.js", "pwa.js", "manifest.webmanifest"):
            self.assertFalse((WEB / name).exists(), f"web/{name} should be gone")

    def test_no_page_registers_a_service_worker(self):
        for page in WEB.rglob("*.html"):
            html = page.read_text(encoding="utf-8", errors="surrogateescape")
            self.assertNotIn("serviceWorker", html, str(page))
            self.assertNotIn("pwa.js", html, str(page))
