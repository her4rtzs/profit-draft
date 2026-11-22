import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.accounts.models import Role

THREE_DAYS = 3 * 24 * 60 * 60


class SessionLifetimeTests(TestCase):
    def test_global_session_settings(self):
        self.assertEqual(settings.SESSION_COOKIE_AGE, THREE_DAYS)
        self.assertFalse(settings.SESSION_EXPIRE_AT_BROWSER_CLOSE)
        self.assertFalse(settings.SESSION_SAVE_EVERY_REQUEST)
        self.assertEqual(
            settings.SESSION_ENGINE,
            "django.contrib.sessions.backends.db",
        )
        self.assertTrue(settings.SESSION_COOKIE_HTTPONLY)

    def test_every_role_gets_three_days_via_json_login(self):
        User = get_user_model()
        for role in (Role.OWNER, Role.CASHIER, Role.TRAINER, Role.MEMBER):
            with self.subTest(role=role):
                username = f"session-{role.value}".lower()
                User.objects.create_user(
                    username=username,
                    email=f"{username}@example.com",
                    password="pw-12345",
                    role=role,
                )
                res = Client().post(
                    "/api/auth/login/",
                    data=json.dumps({"identity": username, "password": "pw-12345"}),
                    content_type="application/json",
                )
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.cookies["sessionid"]["max-age"], THREE_DAYS)

    def test_html_login_also_gets_three_days(self):
        get_user_model().objects.create_user(
            username="html@example.com", email="html@example.com",
            password="pw-12345", role=Role.MEMBER,
        )
        res = Client().post(
            "/accounts/login/",
            {"email": "html@example.com", "password": "pw-12345"},
        )
        self.assertRedirects(res, "/", fetch_redirect_response=False)
        self.assertEqual(res.cookies["sessionid"]["max-age"], THREE_DAYS)
