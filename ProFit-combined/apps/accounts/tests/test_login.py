"""Login/logout tests (design tests 11-13)."""

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings

User = get_user_model()

PASSWORD = "sup3r-secret-pw!"

_PLAIN_STATIC = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@override_settings(STORAGES=_PLAIN_STATIC)
class LoginTests(TestCase):
    def setUp(self):
        self.member = User.objects.create_user(
            username="member@example.com",
            email="member@example.com",
            password=PASSWORD,
            is_active=True,
        )

    def test_login_succeeds_for_verified_member(self):
        c = Client()
        resp = c.post(
            "/accounts/login/",
            {"email": "Member@Example.com", "password": PASSWORD},
        )
        self.assertRedirects(resp, "/", fetch_redirect_response=False)
        self.assertIn("_auth_user_id", c.session)

    def test_login_fails_generically_for_inactive_member(self):
        self.member.is_active = False
        self.member.save(update_fields=["is_active"])
        c = Client()
        resp = c.post(
            "/accounts/login/",
            {"email": "member@example.com", "password": PASSWORD},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("_auth_user_id", c.session)

    def test_logout_ends_session(self):
        c = Client(enforce_csrf_checks=True)
        c.force_login(self.member)
        self.assertIn("_auth_user_id", c.session)
        # CSRF-protected POST: without a token the logout is forbidden.
        resp_no_csrf = c.post("/accounts/logout/")
        self.assertEqual(resp_no_csrf.status_code, 403)

        # With a token the logout succeeds and clears the session.
        c2 = Client()
        c2.force_login(self.member)
        resp = c2.post("/accounts/logout/")
        self.assertRedirects(resp, "/", fetch_redirect_response=False)
        self.assertNotIn("_auth_user_id", c2.session)
