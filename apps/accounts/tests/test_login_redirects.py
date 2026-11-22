import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.accounts.models import Role


class LoginRedirectTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="redirect@example.com", email="redirect@example.com",
            password="pw-12345", role=Role.MEMBER,
        )

    def test_json_login_valid_next_is_returned(self):
        res = Client().post(
            "/api/auth/login/",
            data=json.dumps({
                "identity": "redirect@example.com",
                "password": "pw-12345",
                "next": "/member-home",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["redirect"], "/member-home")

    def test_json_login_external_next_is_rejected(self):
        res = Client().post(
            "/api/auth/login/",
            data=json.dumps({
                "identity": "redirect@example.com",
                "password": "pw-12345",
                "next": "https://evil.example/steal",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["redirect"], "/member-home")

    def test_authenticated_login_pages_redirect_to_role_home(self):
        c = Client()
        c.force_login(self.user)
        for url in ("/login", "/accounts/login/"):
            with self.subTest(url=url):
                res = c.get(url)
                self.assertRedirects(res, "/member-home", fetch_redirect_response=False)

    def test_anonymous_protected_page_preserves_next(self):
        res = Client().get("/member-home")
        self.assertEqual(res.status_code, 302)
        self.assertIn("next=", res.url)
        self.assertIn("/member-home", res.url)
