"""Tests for full-name enforcement, phone duplicate warning, profile update, and Owner-only cashiers."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, StaffInvite
from apps.membership.models import MemberProfile
from apps.membership.services import (
    DuplicatePhoneError,
    FULL_NAME_ERROR,
    PUBLIC_DUPLICATE_PHONE_ERROR,
    create_member,
    normalize_ph_phone,
    register_trial_member,
)

User = get_user_model()


class FullNameAndPhoneDuplicateTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner@example.com",
            email="owner@example.com",
            password="OwnerPassword123!",
            first_name="Alex",
            last_name="Owner",
            role=Role.OWNER,
            is_active=True,
        )
        self.client = APIClient()

    def test_normalize_ph_phone_matches_formats(self):
        self.assertEqual(normalize_ph_phone("09171234567"), "9171234567")
        self.assertEqual(normalize_ph_phone("+639171234567"), "9171234567")
        self.assertEqual(normalize_ph_phone("+63 917-123-4567"), "9171234567")
        self.assertEqual(normalize_ph_phone("917 123 4567"), "9171234567")
        self.assertEqual(normalize_ph_phone("12345"), "")

    def test_public_signup_rejects_single_word_name(self):
        with self.assertRaises(ValidationError) as ctx:
            register_trial_member(
                name="Maria",
                email="maria.single@gmail.com",
                password="StrongPassword123!",
                phone="09171234567",
            )
        self.assertIn(FULL_NAME_ERROR, ctx.exception.messages)

    def test_public_signup_api_rejects_single_word_name(self):
        res = self.client.post(
            "/api/join/checkout/",
            {
                "name": "Juan",
                "email": "juan.single@gmail.com",
                "phone": "09171234567",
                "password": "StrongPassword123!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["detail"], FULL_NAME_ERROR)

    def test_public_signup_duplicate_phone_is_generic_and_hides_member_name(self):
        register_trial_member(
            name="Maria Santos",
            email="maria.santos@gmail.com",
            password="StrongPassword123!",
            phone="09171234567",
        )
        res = self.client.post(
            "/api/join/checkout/",
            {
                "name": "Pedro Reyes",
                "email": "pedro.reyes@gmail.com",
                "phone": "+639171234567",
                "password": "StrongPassword123!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        detail = res.json()["detail"]
        self.assertEqual(detail, PUBLIC_DUPLICATE_PHONE_ERROR)
        self.assertNotIn("Maria", detail)
        self.assertNotIn("Santos", detail)

    def test_staff_walkin_rejects_single_word_name(self):
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(
            "/api/staff/members/",
            {
                "name": "Carlos",
                "email": "carlos.walkin@gmail.com",
                "password": "StrongPassword123!",
                "phone": "09175554444",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn(FULL_NAME_ERROR, str(res.json()))

    def test_staff_walkin_duplicate_phone_warns_then_allows_confirmation(self):
        existing = create_member(
            name="Elena Cruz",
            email="elena.cruz@gmail.com",
            password="StrongPassword123!",
            phone="09178889999",
        )
        self.assertEqual(existing.user.first_name, "Elena")
        self.assertEqual(existing.user.last_name, "Cruz")

        # Service-level check raises DuplicatePhoneError without confirmation
        with self.assertRaises(DuplicatePhoneError) as ctx:
            create_member(
                name="Marco Cruz",
                email="marco.cruz@gmail.com",
                password="StrongPassword123!",
                phone="+63 917-888-9999",
            )
        self.assertEqual(ctx.exception.matches[0]["name"], "Elena Cruz")

        # API returns 409 with match info so staff can decide
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(
            "/api/staff/members/",
            {
                "name": "Marco Cruz",
                "email": "marco.cruz@gmail.com",
                "password": "StrongPassword123!",
                "phone": "+639178889999",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 409)
        body = res.json()
        self.assertEqual(body["code"], "duplicate_phone")
        self.assertEqual(body["matches"][0]["name"], "Elena Cruz")

        # Confirming allows staff to proceed (e.g. shared family phone)
        res2 = self.client.post(
            "/api/staff/members/",
            {
                "name": "Marco Cruz",
                "email": "marco.cruz@gmail.com",
                "password": "StrongPassword123!",
                "phone": "+639178889999",
                "confirm_duplicate_phone": True,
            },
            format="json",
        )
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(MemberProfile.objects.filter(user__email="marco.cruz@gmail.com").count(), 1)

    def test_session_never_returns_email_as_name_and_profile_patch_updates_name(self):
        blank_owner = User.objects.create_user(
            username="blankowner@gmail.com",
            email="blankowner@gmail.com",
            password="OwnerPassword123!",
            first_name="",
            last_name="",
            role=Role.OWNER,
            is_active=True,
        )
        self.client.force_login(blank_owner)
        res = self.client.get("/api/auth/session/")
        self.assertEqual(res.status_code, 200)
        user_data = res.json()["user"]
        self.assertEqual(user_data["name"], "")
        self.assertTrue(user_data["name_missing"])
        self.assertNotIn("@", user_data["name"])

        # Single-word update rejected
        bad = self.client.patch("/api/auth/profile/", {"name": "Joyce"}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bad.json()["detail"], FULL_NAME_ERROR)

        # Full-name update persists to DB
        good = self.client.patch("/api/auth/profile/", {"name": "Joyce Reyes"}, format="json")
        self.assertEqual(good.status_code, 200)
        blank_owner.refresh_from_db()
        self.assertEqual(blank_owner.first_name, "Joyce")
        self.assertEqual(blank_owner.last_name, "Reyes")
        self.assertEqual(good.json()["user"]["name"], "Joyce Reyes")
        self.assertFalse(good.json()["user"]["name_missing"])

        # Avatar photo persists to DB and is returned by /api/auth/session/
        sample_photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        photo_res = self.client.patch("/api/auth/profile/", {"photo": sample_photo}, format="json")
        self.assertEqual(photo_res.status_code, 200)
        self.assertEqual(photo_res.json()["user"]["photo"], sample_photo)
        session_after = self.client.get("/api/auth/session/").json()["user"]
        self.assertEqual(session_after["photo"], sample_photo)

        # Non-image photo is rejected
        bad_photo = self.client.patch("/api/auth/profile/", {"photo": "https://evil.test/x.png"}, format="json")
        self.assertEqual(bad_photo.status_code, 400)

        # Clearing photo removes it from DB
        clear_res = self.client.patch("/api/auth/profile/", {"photo": ""}, format="json")
        self.assertEqual(clear_res.status_code, 200)
        self.assertEqual(clear_res.json()["user"]["photo"], "")

        # Faceless preset avatar ID is accepted
        preset_res = self.client.patch("/api/auth/profile/", {"photo": "av-4"}, format="json")
        self.assertEqual(preset_res.status_code, 200)
        self.assertEqual(preset_res.json()["user"]["photo"], "av-4")

    def test_trial_member_can_open_onboarding_and_save_setup(self):
        profile = register_trial_member(
            name="Ana Reyes",
            email="ana.onboard@gmail.com",
            password="StrongPassword123!",
            phone="09172223333",
        )
        self.client.force_login(profile.user)
        self.assertEqual(self.client.get("/onboarding").status_code, 200)

        save_res = self.client.patch(
            "/api/member/me/",
            {
                "name": "Ana Marie Reyes",
                "phone": "09172223334",
                "photo": "av-2",
                "onboarding": {
                    "goals": ["Build strength", "Stay active"],
                    "experience_level": "Beginner",
                    "best_time": "Morning",
                    "height_cm": "162",
                    "weight_kg": "58",
                    "health_notes": "Mild knee soreness",
                    "emergency_name": "Juan Reyes",
                    "emergency_phone": "09179998888",
                    "completed": True,
                },
            },
            format="json",
        )
        self.assertEqual(save_res.status_code, 200)
        me = self.client.get("/api/member/me/").json()
        self.assertEqual(me["user"]["name"], "Ana Marie Reyes")
        self.assertEqual(me["user"]["photo"], "av-2")
        self.assertTrue(me["user"]["onboardingCompleted"])
        self.assertEqual(me["user"]["onboarding"]["best_time"], "Morning")


class OwnerCashierManagementTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner@gmail.com",
            email="owner@gmail.com",
            password="OwnerPassword123!",
            first_name="Owner",
            last_name="User",
            role=Role.OWNER,
            is_active=True,
        )
        self.cashier = User.objects.create_user(
            username="cashier@gmail.com",
            email="cashier@gmail.com",
            password="CashierPassword123!",
            first_name="Desk",
            last_name="Cashier",
            role=Role.CASHIER,
            is_active=True,
        )
        self.member = User.objects.create_user(
            username="member@gmail.com",
            email="member@gmail.com",
            password="MemberPassword123!",
            first_name="Regular",
            last_name="Member",
            role=Role.MEMBER,
            is_active=True,
        )
        self.client = APIClient()

    def test_non_owner_cannot_access_cashiers_api_or_page(self):
        for non_owner in (self.cashier, self.member):
            self.client.force_authenticate(user=non_owner)
            self.assertEqual(self.client.get("/api/staff/cashiers/").status_code, 403)
            self.assertEqual(
                self.client.post(
                    "/api/staff/cashiers/",
                    {"full_name": "New Cashier", "email": "newcashier@gmail.com"},
                    format="json",
                ).status_code,
                403,
            )

        self.client.force_login(self.cashier)
        self.assertEqual(self.client.get("/cashiers").status_code, 403)

    def test_owner_can_invite_resend_and_deactivate_cashier_without_deleting(self):
        self.client.force_authenticate(user=self.owner)

        # Invite new cashier
        res = self.client.post(
            "/api/staff/cashiers/",
            {"full_name": "Rosa Mendoza", "email": "rosa.mendoza@gmail.com"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["status"], "Invite pending")
        self.assertEqual(data["status_key"], "pending")
        self.assertIn("invite_url", data)
        cashier_id = data["id"]

        invited_user = User.objects.get(pk=cashier_id)
        self.assertEqual(invited_user.role, Role.CASHIER)
        self.assertFalse(invited_user.is_active)
        self.assertTrue(StaffInvite.objects.filter(email="rosa.mendoza@gmail.com", role=Role.CASHIER).exists())

        # List shows 1 active (self.cashier) and 1 pending (Rosa)
        listing = self.client.get("/api/staff/cashiers/").json()
        self.assertEqual(listing["active_count"], 1)
        self.assertEqual(listing["pending_invites_count"], 1)

        # Resend invite works for pending cashier
        resend = self.client.post(f"/api/staff/cashiers/{cashier_id}/resend-invite/", {}, format="json")
        self.assertEqual(resend.status_code, 200)
        self.assertIn("invite_url", resend.json())

        # Deactivate marks user inactive and preserves row (never deletes)
        deact = self.client.post(f"/api/staff/cashiers/{self.cashier.pk}/deactivate/", {}, format="json")
        self.assertEqual(deact.status_code, 200)
        self.assertEqual(deact.json()["status"], "Deactivated")
        self.cashier.refresh_from_db()
        self.assertFalse(self.cashier.is_active)
        self.assertTrue(User.objects.filter(pk=self.cashier.pk).exists())

    def test_cashier_and_trainer_can_complete_onboarding(self):
        trainer = User.objects.create_user(
            username="coach.dan@gmail.com",
            email="coach.dan@gmail.com",
            password="TrainerPassword123!",
            first_name="Dan",
            last_name="Coach",
            role=Role.TRAINER,
            is_active=True,
        )
        # Cashier onboarding
        self.client.force_login(self.cashier)
        self.assertEqual(self.client.get("/onboarding").status_code, 200)
        s1 = self.client.get("/api/auth/session/").json()["user"]
        self.assertFalse(s1["onboarding_completed"])
        res_c = self.client.patch(
            "/api/auth/profile/",
            {
                "name": "Desk Cashier",
                "photo": "av-3",
                "onboarding": {"shift": "Morning", "ack": True, "completed": True},
            },
            format="json",
        )
        self.assertEqual(res_c.status_code, 200)
        self.assertTrue(res_c.json()["user"]["onboarding_completed"])

        # Trainer onboarding
        self.client.force_login(trainer)
        self.assertEqual(self.client.get("/onboarding").status_code, 200)
        s2 = self.client.get("/api/auth/session/").json()["user"]
        self.assertFalse(s2["onboarding_completed"])
        res_t = self.client.patch(
            "/api/auth/profile/",
            {
                "name": "Coach Dan",
                "photo": "av-4",
                "onboarding": {
                    "specialties": ["Strength", "Boxing"],
                    "years_experience": "3",
                    "days": ["Mon", "Wed", "Fri"],
                    "slot": "Evening",
                    "completed": True,
                },
            },
            format="json",
        )
        self.assertEqual(res_t.status_code, 200)
        self.assertTrue(res_t.json()["user"]["onboarding_completed"])

    def test_cashier_invite_link_accept_redirects_to_onboarding_then_cashier_desk(self):
        from urllib.parse import urlparse
        from django.test import Client, override_settings

        # 1. Owner invites a new cashier (same link sent to Gmail)
        self.client.force_authenticate(user=self.owner)
        invite_res = self.client.post(
            "/api/staff/cashiers/",
            {"full_name": "Liza Cruz", "email": "liza.cashier@gmail.com"},
            format="json",
        )
        self.assertEqual(invite_res.status_code, 201)
        invite_path = urlparse(invite_res.json()["invite_url"]).path

        # 2. Cashier clicks the invite link from email and sets their password
        web = Client()
        with override_settings(
            STORAGES={
                "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
                "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
            }
        ):
            self.assertEqual(web.get(invite_path).status_code, 200)
            accept_res = web.post(
                invite_path,
                {"password": "CashierStrong123!", "confirm_password": "CashierStrong123!"},
            )
        self.assertEqual(accept_res.status_code, 302)
        self.assertEqual(accept_res["Location"], "/onboarding")

        # 3. Cashier is now signed in, sees /onboarding, and completes onboarding
        self.assertEqual(web.get("/onboarding").status_code, 200)
        sess = web.get("/api/auth/session/").json()["user"]
        self.assertEqual(sess["role"], "CASHIER")
        self.assertFalse(sess["onboarding_completed"])

        # 4. Finish onboarding -> /cashier desk opens cleanly
        finish = web.patch(
            "/api/auth/profile/",
            data='{"name":"Liza Cruz","photo":"av-2","onboarding":{"shift":"Afternoon","ack":true,"completed":true}}',
            content_type="application/json",
        )
        self.assertEqual(finish.status_code, 200)
        self.assertTrue(finish.json()["user"]["onboarding_completed"])
        self.assertEqual(web.get("/cashier").status_code, 200)
