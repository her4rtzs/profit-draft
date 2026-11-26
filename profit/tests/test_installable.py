"""Installable-app & safe offline-read tests: manifest, icons, head tags, install card, service worker."""

import json
import struct

from django.conf import settings
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
    def test_manifest_is_served_as_manifest_json(self):
        self.assertEqual(
            settings.WHITENOISE_MIMETYPES.get(".webmanifest"),
            "application/manifest+json",
        )
        response = self.client.get("/manifest.webmanifest")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            response["Content-Type"].startswith("application/manifest+json"),
            response["Content-Type"],
        )
        self.assertNotIn("no-store", response.get("Cache-Control", ""))

    def test_manifest_contract(self):
        data = json.loads((WEB / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(data["id"], "/")
        self.assertEqual(data["start_url"], "/")
        self.assertEqual(data["scope"], "/")
        self.assertEqual(data["name"], "ProFit")
        self.assertEqual(data["short_name"], "ProFit")
        self.assertEqual(data["display"], "standalone")
        self.assertEqual(data["theme_color"], "#0a0e17")
        self.assertEqual(data["background_color"], "#0a0e17")
        self.assertNotIn("orientation", data)

        icons = {icon["src"]: icon for icon in data["icons"]}
        self.assertEqual(icons["/static/icons/icon-192.png"]["sizes"], "192x192")
        self.assertEqual(icons["/static/icons/icon-512.png"]["sizes"], "512x512")
        maskable = icons["/static/icons/maskable-icon-512.png"]
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
        self.assertIn('<meta name="theme-color" content="#0a0e17"', html)
        self.assertIn('rel="apple-touch-icon"', html)
        self.assertIn("/static/icons/apple-touch-icon.png", html)
        self.assertIn(
            '<meta name="apple-mobile-web-app-capable" content="yes"', html
        )
        self.assertIn('<meta name="apple-mobile-web-app-title" content="ProFit"', html)
        self.assertIn('name="apple-mobile-web-app-status-bar-style"', html)

    def test_every_static_page_head_has_install_tags(self):
        pages = sorted(WEB.rglob("*.html"))
        self.assertTrue(pages, "no web pages found")
        for page in pages:
            html = page.read_text(encoding="utf-8", errors="surrogateescape")
            head = html.split("</head>", 1)[0]
            self.assertEqual(
                head.count('rel="manifest" href="/manifest.webmanifest"'), 1, page.name
            )
            self.assertEqual(
                head.count('<meta name="theme-color" content="#0a0e17"'), 1, page.name
            )
            self.assertEqual(
                head.count('rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png"'),
                1,
                page.name,
            )
            self.assertEqual(
                head.count('<meta name="apple-mobile-web-app-capable" content="yes"'),
                1,
                page.name,
            )

    def test_no_utf8_mojibake_in_static_pages(self):
        markers = ("\u00c3\u201a", "\u00c3\u00a2", "\u00c3\u0192", "\u00e2\u201a\u00ac")
        pages = sorted(WEB.rglob("*.html"))
        self.assertTrue(pages, "no web pages found")
        for page in pages:
            html = page.read_text(encoding="utf-8")
            for marker in markers:
                self.assertNotIn(
                    marker,
                    html,
                    f"Mojibake sequence {marker!r} found in {page.name}",
                )


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


@override_settings(STORAGES=_PLAIN_STATIC)
class OfflineSupportTests(TestCase):
    def test_service_worker_is_served_at_root_as_javascript(self):
        self.assertTrue((WEB / "sw.js").is_file(), "web/sw.js is missing")
        response = self.client.get("/sw.js")
        self.assertEqual(response.status_code, 200)
        ctype = response["Content-Type"].lower()
        self.assertTrue(
            "javascript" in ctype,
            f"Unexpected Content-Type for /sw.js: {response['Content-Type']}",
        )
        self.assertIn("no-cache", response.get("Cache-Control", "").lower())

    def test_service_worker_never_caches_api_and_wipes_pages_on_logout(self):
        sw_src = (WEB / "sw.js").read_text(encoding="utf-8")
        self.assertIn("url.pathname.startsWith('/api/')", sw_src)
        self.assertIn("CLEAR_PRIVATE_CACHES", sw_src)
        self.assertIn("caches.delete(PAGES_CACHE)", sw_src)
        self.assertIn("OFFLINE_FALLBACK_HTML", sw_src)

    def test_service_worker_bypasses_and_unregisters_on_localhost_http(self):
        sw_src = (WEB / "sw.js").read_text(encoding="utf-8")
        self.assertIn("IS_LOCAL_DEV", sw_src)
        self.assertIn("if (IS_LOCAL_DEV) return;", sw_src)
        self.assertIn("self.registration.unregister()", sw_src)
        self.assertIn("request.cache === 'only-if-cached'", sw_src)

        api_src = (WEB / "api.js").read_text(encoding="utf-8")
        self.assertIn("unregisterLocalServiceWorkers", api_src)
        self.assertIn('if (location.protocol !== "https:") return;', api_src)

        footer_src = (WEB / "site-footer.js").read_text(encoding="utf-8")
        self.assertIn("getRegistrations", footer_src)
        self.assertIn('else if (location.protocol === "https:")', footer_src)

    def test_api_client_and_public_footer_register_sw_and_wipe_on_logout(self):
        api_src = (WEB / "api.js").read_text(encoding="utf-8")
        self.assertIn('register("/sw.js"', api_src)
        self.assertIn("pf-api-cache:v1:", api_src)
        self.assertIn("clearOfflineData", api_src)
        self.assertIn("profit-back-online", api_src)
        self.assertIn("Reconnect to the internet to save changes.", api_src)

        footer_src = (WEB / "site-footer.js").read_text(encoding="utf-8")
        self.assertIn('register("/sw.js"', footer_src)

        auth_src = (WEB / "auth.js").read_text(encoding="utf-8")
        self.assertIn("clearOfflineData", auth_src)
        self.assertIn("profit-offline-user", auth_src)
