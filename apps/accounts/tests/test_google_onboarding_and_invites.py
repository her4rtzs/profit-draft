"""Tests for linked-only Google login, first-login OTP+consent gate, invites, and Settings connect/disconnect."""

import json
import re
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import Client, TestCase
from django.utils import timezone

from apps.accounts.google_auth import GoogleClaims
from apps.accounts.models import EmailOTP, OTPPurpose, Role
from apps.accounts.services import create_staff_invite
from apps.membership.models import MemberProfile

User = get_user_model()


class LinkedGoogleAndOnboardingGateTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.owner = User.objects.create_user(
            username="owner@profit.test",
            email="owner@profit.test",
            password="OwnerStrongPassword123!",
            role=Role.OWNER,
            is_staff=True,
        )
        self.cashier = User.objects.create_user(
            username="cashier@profit.test",
            email="cashier@profit.test",
            password="CashierStrongPassword123!",
            role=Role.CASHIER,
        )
        self.trainer = User.objects.create_user(
            username="trainer@profit.test",
            email="trainer@profit.test",
            password="TrainerStrongPassword123!",
            role=Role.TRAINER,
        )
        self.member = User.objects.create_user(
            username="member@profit.test",
            email="member@profit.test",
            password="MemberStrongPassword123!",
            role=Role.MEMBER,
        )
        MemberProfile.objects.create(
            user=self.member,
            membership_status=MemberProfile.MembershipStatus.ACTIVE,
        )

    def _csrf(self):
        return self.client.get("/api/auth/csrf/").cookies["csrftoken"].value

    def _login_password(self, user, password):
        resp = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"identity": user.email, "password": password}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(resp.status_code, 200)

    def test_linked_google_login_works_for_owner_cashier_trainer_member(self):
        cases = [
            (self.owner, "ADMIN", "/index"),
            (self.cashier, "CASHIER", "/cashier"),
            (self.trainer, "TRAINER", "/trainer/index"),
            (self.member, "MEMBER", "/member-home"),
        ]
        now = timezone.now()
        for user, web_role, expected_home in cases:
            with self.subTest(role=user.role):
                self.client = Client(enforce_csrf_checks=True)
                user.google_sub = f"sub-{user.role.lower()}"
                user.google_email = user.email
                user.google_linked_at = now
                user.first_login_otp_verified_at = now
                user.tos_accepted_at = now
                user.privacy_accepted_at = now
                user.onboarding_data = {"completed": True}
                user.save()

                claims = GoogleClaims(
                    sub=user.google_sub,
                    email=user.email,
                    email_verified=True,
                    name=user.role.title(),
                )
                with patch("api.auth.verify_google_id_token", return_value=claims):
                    resp = self.client.post(
                        "/api/auth/google/",
                        data=json.dumps({"credential": "fake-id-token", "source": "login"}),
                        content_type="application/json",
                        HTTP_X_CSRFTOKEN=self._csrf(),
                    )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertEqual(body["role"], web_role)
                self.assertEqual(body["redirect"], expected_home)

    def test_new_google_user_on_login_goes_through_otp_then_consent_to_dashboard(self):
        claims = GoogleClaims(
            sub="brand-new-google-sub",
            email="brandnewvisitor@gmail.com",
            email_verified=True,
            name="Brand New",
        )
        mail.outbox.clear()
        with patch("api.auth.verify_google_id_token", return_value=claims):
            resp = self.client.post(
                "/api/auth/google/",
                data=json.dumps({"credential": "fake-id-token", "source": "login"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=self._csrf(),
            )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["created"])
        self.assertEqual(body["role"], "MEMBER")
        self.assertEqual(body["redirect"], "/accounts/onboarding/")

        # Dashboard blocked until OTP -> Terms & Privacy completed
        self.assertEqual(self.client.get("/member-home").status_code, 302)
        self.assertEqual(self.client.get("/accounts/onboarding/otp/").status_code, 200)
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        self.client.post("/accounts/onboarding/otp/", {"code": code}, HTTP_X_CSRFTOKEN=self._csrf())
        self.client.post(
            "/accounts/onboarding/consent/",
            {"accept_terms": "on", "accept_privacy": "on"},
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(self.client.get("/member-home").status_code, 200)

    def test_first_login_gate_blocks_dashboard_until_otp_and_consent_complete(self):
        # Owner connected Google via Settings, first time using Google -> needs OTP + Consent
        self.owner.google_sub = "owner-first-sub"
        self.owner.google_email = "owner.gmail@gmail.com"
        self.owner.google_linked_at = timezone.now()
        self.owner.save()

        claims = GoogleClaims(
            sub="owner-first-sub",
            email="owner.gmail@gmail.com",
            email_verified=True,
            name="Owner User",
        )
        mail.outbox.clear()
        with patch("api.auth.verify_google_id_token", return_value=claims):
            resp = self.client.post(
                "/api/auth/google/",
                data=json.dumps({"credential": "fake-token", "source": "login"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=self._csrf(),
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["redirect"], "/accounts/onboarding/")

        # Dashboards & APIs are blocked
        dash_resp = self.client.get("/index")
        self.assertEqual(dash_resp.status_code, 302)
        self.assertEqual(dash_resp["Location"], "/accounts/onboarding/")
        api_resp = self.client.get("/api/staff/members/")
        self.assertEqual(api_resp.status_code, 403)
        self.assertEqual(api_resp.json()["code"], "onboarding_required")

        # Cannot skip OTP to consent
        skip_resp = self.client.get("/accounts/onboarding/consent/")
        self.assertEqual(skip_resp.status_code, 302)
        self.assertEqual(skip_resp["Location"], "/accounts/onboarding/otp/")

        # Step 1: GET OTP issues 6-digit code
        otp_page = self.client.get("/accounts/onboarding/otp/")
        self.assertEqual(otp_page.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)

        # Verify OTP -> goes to Consent; dashboard still blocked!
        verify_resp = self.client.post(
            "/accounts/onboarding/otp/",
            {"code": code},
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(verify_resp.status_code, 302)
        self.assertEqual(verify_resp["Location"], "/accounts/onboarding/consent/")
        self.assertEqual(self.client.get("/index").status_code, 302)

        # Step 2: Consent POST without both checkboxes is rejected (400) and stays blocked
        for bad_data in ({}, {"accept_terms": "on"}, {"accept_privacy": "on"}):
            bad_consent = self.client.post(
                "/accounts/onboarding/consent/",
                bad_data,
                HTTP_X_CSRFTOKEN=self._csrf(),
            )
            self.assertEqual(bad_consent.status_code, 400)
            self.assertEqual(self.client.get("/index").status_code, 302)

        # Consent POST with both checkboxes unlocks dashboard
        ok_consent = self.client.post(
            "/accounts/onboarding/consent/",
            {"accept_terms": "on", "accept_privacy": "on"},
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(ok_consent.status_code, 302)
        self.assertEqual(ok_consent["Location"], "/index")
        self.assertEqual(self.client.get("/index").status_code, 200)

    def test_first_login_otp_attempts_lock_expiry_and_resend_cooldown(self):
        self.owner.needs_first_login_otp = True
        self.owner.needs_legal_consent = True
        self.owner.save()
        self.client.force_login(self.owner)

        mail.outbox.clear()
        self.client.get("/accounts/onboarding/otp/")
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        wrong = "000001" if code != "000001" else "000002"

        # Immediate resend hits 60s cooldown -> 429
        cooldown_resp = self.client.post(
            "/accounts/onboarding/otp/resend/",
            HTTP_X_CSRFTOKEN=self._csrf(),
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(cooldown_resp.status_code, 429)
        self.assertEqual(cooldown_resp.json()["status"], "cooldown")

        # 5 wrong attempts count up and lock the code
        for expected_attempts in range(1, EmailOTP.MAX_ATTEMPTS + 1):
            r = self.client.post(
                "/accounts/onboarding/otp/",
                {"code": wrong},
                HTTP_X_CSRFTOKEN=self._csrf(),
            )
            self.assertEqual(r.status_code, 400)
            otp_row = EmailOTP.objects.filter(user=self.owner, purpose=OTPPurpose.FIRST_LOGIN).latest("created_at")
            self.assertEqual(otp_row.attempts, expected_attempts)

        # Even submitting the real code after 5 wrong attempts fails
        locked_resp = self.client.post(
            "/accounts/onboarding/otp/",
            {"code": code},
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(locked_resp.status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.needs_first_login_otp)

        # Age cooldown and resend -> expired code fails too
        otp_row.created_at = timezone.now() - EmailOTP.RESEND_COOLDOWN - timedelta(seconds=2)
        otp_row.save(update_fields=["created_at"])
        resend_ok = self.client.post(
            "/accounts/onboarding/otp/resend/",
            HTTP_X_CSRFTOKEN=self._csrf(),
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(resend_ok.status_code, 200)
        new_code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        new_row = EmailOTP.objects.filter(user=self.owner, purpose=OTPPurpose.FIRST_LOGIN).latest("created_at")
        new_row.expires_at = timezone.now() - timedelta(seconds=1)
        new_row.save(update_fields=["expires_at"])

        expired_resp = self.client.post(
            "/accounts/onboarding/otp/",
            {"code": new_code},
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(expired_resp.status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.needs_first_login_otp)

    def test_invite_password_rules_revoked_and_google_email_match(self):
        # 1. Revoked invite fails
        revoked_inv, revoked_tok = create_staff_invite(
            owner=self.owner, email="revoked.cashier@gmail.com", role=Role.CASHIER
        )
        revoked_inv.revoked_at = timezone.now()
        revoked_inv.save(update_fields=["revoked_at"])
        rev_post = self.client.post(
            f"/accounts/invite/accept/{revoked_inv.pk}/{revoked_tok}/",
            {"password": "CashierStrong123!", "confirm_password": "CashierStrong123!"},
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(rev_post.status_code, 400)
        self.assertFalse(User.objects.filter(email="revoked.cashier@gmail.com").exists())

        # 2. Weak password fails validation
        invite, raw = create_staff_invite(
            owner=self.owner, email="staff.coach@gmail.com", role=Role.TRAINER
        )
        weak_post = self.client.post(
            f"/accounts/invite/accept/{invite.pk}/{raw}/",
            {"password": "123", "confirm_password": "123"},
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(weak_post.status_code, 400)

        # 3. Google email mismatch fails WITHOUT consuming invite
        wrong_claims = GoogleClaims(
            sub="wrong-google-sub",
            email="someoneelse@gmail.com",
            email_verified=True,
            name="Wrong Person",
        )
        with patch("apps.accounts.views.verify_google_id_token", return_value=wrong_claims):
            mismatch = self.client.post(
                f"/accounts/invite/accept/{invite.pk}/{raw}/google/",
                data=json.dumps({"credential": "bad-email-token"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=self._csrf(),
            )
        self.assertEqual(mismatch.status_code, 403)
        self.assertEqual(mismatch.json()["code"], "invite_email_mismatch")
        invite.refresh_from_db()
        self.assertIsNone(invite.used_at)

        # 4. Matching Google email activates once and sends through onboarding gate
        good_claims = GoogleClaims(
            sub="coach-google-sub-1",
            email="staff.coach@gmail.com",
            email_verified=True,
            name="Coach Maria",
        )
        with patch("apps.accounts.views.verify_google_id_token", return_value=good_claims):
            ok = self.client.post(
                f"/accounts/invite/accept/{invite.pk}/{raw}/google/",
                data=json.dumps({"credential": "good-email-token"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=self._csrf(),
            )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["redirect"], "/accounts/onboarding/")
        user = User.objects.get(email="staff.coach@gmail.com")
        self.assertEqual(user.role, Role.TRAINER)
        self.assertTrue(user.requires_first_login_gate)

        # Re-using the same invite link fails (400) for an anonymous caller
        anon = Client(enforce_csrf_checks=True)
        anon_csrf = anon.get("/api/auth/csrf/").cookies["csrftoken"].value
        reuse = anon.post(
            f"/accounts/invite/accept/{invite.pk}/{raw}/",
            {"password": "AnotherStrongPassword123!", "confirm_password": "AnotherStrongPassword123!"},
            HTTP_X_CSRFTOKEN=anon_csrf,
        )
        self.assertEqual(reuse.status_code, 400)

    def test_connect_and_disconnect_lockout_protection(self):
        # 1. Google-only Member (no usable password) is BLOCKED from disconnecting
        google_only = User.objects.create_user(
            username="googleonly@gmail.com",
            email="googleonly@gmail.com",
            role=Role.MEMBER,
            google_sub="google-only-sub",
            google_email="googleonly@gmail.com",
            google_linked_at=timezone.now(),
        )
        google_only.set_unusable_password()
        google_only.save()
        MemberProfile.objects.create(user=google_only, membership_status=MemberProfile.MembershipStatus.TRIAL)

        self.client.force_login(google_only)
        blocked_disc = self.client.post(
            "/api/auth/google/disconnect/",
            data="{}",
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(blocked_disc.status_code, 400)
        self.assertEqual(blocked_disc.json()["code"], "lockout_prevented")
        google_only.refresh_from_db()
        self.assertEqual(google_only.google_sub, "google-only-sub")

        # After setting a password, Disconnect succeeds cleanly
        set_pw = self.client.post(
            "/api/auth/set-password/",
            data=json.dumps({"new_password": "StrongNewPassword123!", "confirm_password": "StrongNewPassword123!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(set_pw.status_code, 200)
        self.assertTrue(set_pw.json()["user"]["has_password"])

        ok_disc = self.client.post(
            "/api/auth/google/disconnect/",
            data="{}",
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(ok_disc.status_code, 200)
        self.assertFalse(ok_disc.json()["user"]["google_connected"])

        # 2. Password-based Cashier can connect and disconnect Google cleanly
        self.client = Client(enforce_csrf_checks=True)
        self._login_password(self.cashier, "CashierStrongPassword123!")
        cashier_claims = GoogleClaims(
            sub="cashier-sub-1",
            email="cashier.gmail@gmail.com",
            email_verified=True,
            name="Cashier Gmail",
        )
        with patch("api.auth.verify_google_id_token", return_value=cashier_claims):
            conn = self.client.post(
                "/api/auth/google/connect/",
                data=json.dumps({"credential": "token"}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=self._csrf(),
            )
        self.assertEqual(conn.status_code, 200)
        self.assertTrue(conn.json()["user"]["google_connected"])
        self.assertEqual(conn.json()["user"]["google_email"], "cashier.gmail@gmail.com")
