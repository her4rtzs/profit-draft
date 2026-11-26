"""Server-side RBAC, WhiteNoise .html protection, and unified /dashboard dispatch tests."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import Role
from apps.membership.models import MemberProfile
from apps.membership.services import enroll_member

User = get_user_model()


@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class PortalRBACTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner@gym.test",
            email="owner@gym.test",
            password="Password123!",
            role=Role.OWNER,
            is_active=True,
        )
        self.cashier = User.objects.create_user(
            username="cashier@gym.test",
            email="cashier@gym.test",
            password="Password123!",
            role=Role.CASHIER,
            is_active=True,
            onboarding_data={"completed": True},
        )
        self.trainer = User.objects.create_user(
            username="trainer@gym.test",
            email="trainer@gym.test",
            password="Password123!",
            role=Role.TRAINER,
            is_active=True,
            onboarding_data={"completed": True},
        )
        self.member = User.objects.create_user(
            username="member@gym.test",
            email="member@gym.test",
            password="Password123!",
            role=Role.MEMBER,
            is_active=True,
            onboarding_data={"completed": True},
        )
        self.profile = MemberProfile.objects.create(user=self.member, membership_status="TRIAL")
        today = timezone.localdate()
        enroll_member(
            self.profile,
            today - timedelta(days=1),
            today + timedelta(days=30),
            created_by=self.owner,
        )

    def test_anonymous_cannot_open_any_portal_or_html_file(self):
        protected = (
            "/dashboard",
            "/dashboard/",
            "/index",
            "/index.html",
            "/cashier",
            "/cashier.html",
            "/reports",
            "/reports.html",
            "/trainers",
            "/cashiers",
            "/announcements",
            "/payments",
            "/members",
            "/attendance",
            "/settings",
            "/notifications",
            "/profile",
            "/member-home",
            "/member-home.html",
            "/onboarding",
            "/trainer/index",
            "/trainer/index.html",
            "/trainer/members",
            "/trainer/attendance",
            "/trainer/schedule",
            "/trainer/announcements",
            "/trainer/notifications",
            "/trainer/profile",
            "/trainer/settings",
            "/trainer/settings.html",
        )
        for path in protected:
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertEqual(res.status_code, 302)
                self.assertTrue(res["Location"].startswith("/login?next="))

    def test_public_pages_and_css_assets_remain_accessible(self):
        for path in ("/", "/login", "/join", "/forgot", "/faq", "/terms", "/privacy"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)
        self.assertRedirects(
            self.client.get("/welcome"), "/", status_code=301, fetch_redirect_response=False
        )
        self.assertRedirects(self.client.get("/login.html"), "/login", fetch_redirect_response=False)
        self.assertEqual(self.client.get("/pf-system.css").status_code, 200)

    def test_dashboard_renders_role_specific_workspace(self):
        expectations = [
            (self.owner, b"Owner Dashboard"),
            (self.cashier, b"Cashier Portal"),
            (self.trainer, b"Coach Dashboard"),
            (self.member, b"My membership"),
        ]
        for user, marker in expectations:
            with self.subTest(role=user.role):
                c = Client()
                c.force_login(user)
                res = c.get("/dashboard")
                self.assertEqual(res.status_code, 200)
                self.assertIn(marker, res.content)

    def test_role_isolation_across_portals_and_html_urls(self):
        owner_client = Client()
        owner_client.force_login(self.owner)
        for path in ("/reports", "/trainers", "/cashiers", "/announcements", "/payments", "/members", "/settings"):
            self.assertEqual(owner_client.get(path).status_code, 200, path)
        owner_cashier = owner_client.get("/cashier")
        self.assertEqual(owner_cashier.status_code, 403)
        self.assertIn(b"Page not found", owner_cashier.content)
        self.assertIn(b'href="/dashboard"', owner_cashier.content)
        self.assertNotIn(b"Cashier access required", owner_cashier.content)

        for path in ("/cashier", "/cashier.html", "/trainer/index", "/trainer/attendance", "/member-home"):
            self.assertEqual(owner_client.get(path).status_code, 403, f"Owner must be blocked on {path}")

        cashier_client = Client()
        cashier_client.force_login(self.cashier)
        self.assertRedirects(cashier_client.get("/cashier.html"), "/dashboard", fetch_redirect_response=False)
        for path in ("/payments", "/members", "/attendance", "/settings", "/notifications", "/profile"):
            self.assertEqual(cashier_client.get(path).status_code, 200, path)
        for path in ("/index", "/index.html", "/reports", "/reports.html", "/trainers", "/cashiers", "/announcements", "/trainer/index", "/member-home"):
            self.assertEqual(cashier_client.get(path).status_code, 403, f"Cashier must be blocked on {path}")

        trainer_client = Client()
        trainer_client.force_login(self.trainer)
        self.assertRedirects(trainer_client.get("/trainer/index"), "/dashboard", fetch_redirect_response=False)
        for path in ("/trainer/members", "/trainer/attendance", "/trainer/schedule", "/trainer/settings"):
            self.assertEqual(trainer_client.get(path).status_code, 200, path)
        for path in ("/cashier", "/cashier.html", "/index", "/payments", "/reports", "/members", "/profile", "/member-home"):
            self.assertEqual(trainer_client.get(path).status_code, 403, f"Trainer must be blocked on {path}")

        member_client = Client()
        member_client.force_login(self.member)
        self.assertRedirects(member_client.get("/member-home"), "/dashboard", fetch_redirect_response=False)
        for path in ("/profile",):
            self.assertEqual(member_client.get(path).status_code, 200, path)
        for path in ("/cashier", "/cashier.html", "/index", "/payments", "/reports", "/members", "/trainer/index", "/trainer/attendance"):
            self.assertEqual(member_client.get(path).status_code, 403, f"Member must be blocked on {path}")

    def test_inactive_user_cannot_access_dashboard(self):
        self.cashier.is_active = False
        self.cashier.save(update_fields=["is_active"])
        c = Client()
        c.force_login(self.cashier)
        self.assertEqual(c.get("/dashboard").status_code, 302)
        self.assertEqual(c.get("/cashier").status_code, 302)

        from django.test import RequestFactory
        from profit.views import dashboard

        req = RequestFactory().get("/dashboard")
        req.user = self.cashier
        self.assertEqual(dashboard(req).status_code, 403)

    def test_error_404_handler_renders_branded_page_not_found(self):
        res = self.client.get("/does-not-exist")
        self.assertEqual(res.status_code, 404)
        self.assertIn(b"Page not found", res.content)
        self.assertIn(b'href="/login"', res.content)
