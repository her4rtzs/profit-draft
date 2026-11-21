"""Tests for Member-only Google Sign-In, RS256 verification, linking, and RBAC."""

import base64
import hashlib
import json
import random
import time
import urllib.parse
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import DatabaseError
from django.test import Client, RequestFactory, TestCase, override_settings
from django.utils import timezone

from apps.accounts.google_auth import (
    _SHA256_DIGEST_INFO_PREFIX,
    GoogleAuthError,
    GoogleClaims,
    verify_google_access_token,
    verify_google_id_token,
)
from apps.accounts.models import Role
from apps.accounts.validators import validate_real_email
from apps.membership.models import MemberProfile

User = get_user_model()
TEST_CLIENT_ID = "752296461739-tpcmop84u41b31bo3eer33uv2v6fkauq.apps.googleusercontent.com"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _int_b64url(val: int) -> str:
    length = max(1, (val.bit_length() + 7) // 8)
    return _b64url(val.to_bytes(length, "big"))


def _is_prime(n: int) -> bool:
    if n < 2 or n % 2 == 0:
        return n == 2
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for a in (2, 3, 5, 7, 11, 13, 17):
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = (x * x) % n
            if x == n - 1:
                break
        else:
            return False
    return True


def _make_test_rsa_key():
    rng = random.Random(20261119)
    e = 65537
    while True:
        p = rng.getrandbits(512) | (1 << 511) | 1
        while not _is_prime(p):
            p += 2
        q = rng.getrandbits(512) | (1 << 511) | 1
        while not _is_prime(q) or q == p:
            q += 2
        phi = (p - 1) * (q - 1)
        if phi % e != 0:
            d = pow(e, -1, phi)
            return p * q, e, d


class GoogleAuthTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.rsa_n, cls.rsa_e, cls.rsa_d = _make_test_rsa_key()
        cls.kid = "test-kid-1"
        cls.jwks = {
            "keys": [
                {
                    "kty": "RSA",
                    "alg": "RS256",
                    "use": "sig",
                    "kid": cls.kid,
                    "n": _int_b64url(cls.rsa_n),
                    "e": _int_b64url(cls.rsa_e),
                }
            ]
        }

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.owner = User.objects.create_user(
            username="owner@profit.test",
            email="owner@profit.test",
            password="OwnerPassword123!",
            role=Role.OWNER,
            is_staff=True,
        )
        self.trainer = User.objects.create_user(
            username="trainer@profit.test",
            email="trainer@profit.test",
            password="TrainerPassword123!",
            role=Role.TRAINER,
        )
        self.member_pw = User.objects.create_user(
            username="existing@profit.test",
            email="existing@profit.test",
            password="MemberPassword123!",
            first_name="Existing",
            last_name="Member",
            role=Role.MEMBER,
        )
        MemberProfile.objects.create(user=self.member_pw)

    def _csrf(self):
        resp = self.client.get("/api/auth/google/config/")
        self.assertEqual(resp.status_code, 200)
        return resp.cookies["csrftoken"].value

    def _sign_jwt(self, payload: dict, *, kid: str | None = None, alg: str = "RS256") -> str:
        header = {"alg": alg, "typ": "JWT", "kid": kid or self.kid}
        h_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        p_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signing_input = f"{h_b64}.{p_b64}".encode("ascii")
        k = (self.rsa_n.bit_length() + 7) // 8
        digest_info = _SHA256_DIGEST_INFO_PREFIX + hashlib.sha256(signing_input).digest()
        ps_len = k - len(digest_info) - 3
        em = b"\x00\x01" + (b"\xff" * ps_len) + b"\x00" + digest_info
        sig_int = pow(int.from_bytes(em, "big"), self.rsa_d, self.rsa_n)
        sig_bytes = sig_int.to_bytes(k, "big")
        return f"{h_b64}.{p_b64}.{_b64url(sig_bytes)}"

    def _claims_payload(self, **overrides):
        now = int(time.time())
        base = {
            "iss": "https://accounts.google.com",
            "aud": TEST_CLIENT_ID,
            "azp": TEST_CLIENT_ID,
            "sub": "google-sub-new-123",
            "email": "newmember@gmail.com",
            "email_verified": True,
            "name": "Maria Santos",
            "iat": now - 10,
            "exp": now + 300,
        }
        base.update(overrides)
        return base

    def _post_google(self, payload: dict):
        csrf = self._csrf()
        return self.client.post(
            "/api/auth/google/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )

    def test_database_error_is_logged_without_pii(self):
        claims = GoogleClaims(
            sub="google-sub-new-123",
            email="newmember@gmail.com",
            email_verified=True,
            name="Maria Santos",
        )
        error = DatabaseError(
            "column memberprofile.trial_ends_at does not exist\n"
            "DETAIL: Key (google_sub)=(secret-token) already exists."
        )
        with (
            patch("api.auth.verify_google_id_token", return_value=claims),
            patch("api.auth.authenticate_google_member", side_effect=error),
            patch("api.auth.logger.error") as log,
        ):
            resp = self._post_google({"credential": "any-token"})

        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.json()["code"], "db_error")
        log.assert_called_once()
        args = log.call_args.args
        self.assertEqual(args[0], "event=google_db_error step=%s type=%s pgcode=%s message=%s")
        self.assertEqual(args[1], "sign_in")
        self.assertEqual(args[2], "DatabaseError")
        self.assertEqual(args[3], "")
        self.assertIn("trial_ends_at", args[4])
        self.assertNotIn("secret-token", args[4])
        self.assertNotIn("gmail.com", str(args))

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID)
    def test_rs256_token_verification_and_rejection_cases(self):
        fetcher = lambda: self.jwks  # noqa: E731
        valid_token = self._sign_jwt(self._claims_payload())
        claims = verify_google_id_token(valid_token, jwks_fetcher=fetcher)
        self.assertEqual(claims.sub, "google-sub-new-123")
        self.assertEqual(claims.email, "newmember@gmail.com")
        self.assertEqual(claims.name, "Maria Santos")

        # Tampered payload fails signature check
        h, p, s = valid_token.split(".")
        tampered_payload = _b64url(json.dumps(self._claims_payload(sub="evil-sub")).encode("utf-8"))
        with self.assertRaises(GoogleAuthError) as ctx:
            verify_google_id_token(f"{h}.{tampered_payload}.{s}", jwks_fetcher=fetcher)
        self.assertEqual(ctx.exception.status_code, 401)

        # Wrong audience fails
        bad_aud = self._sign_jwt(self._claims_payload(aud="other-client.apps.googleusercontent.com"))
        with self.assertRaises(GoogleAuthError) as ctx:
            verify_google_id_token(bad_aud, jwks_fetcher=fetcher)
        self.assertEqual(ctx.exception.status_code, 401)

        # Wrong issuer fails
        bad_iss = self._sign_jwt(self._claims_payload(iss="https://evil.example.com"))
        with self.assertRaises(GoogleAuthError) as ctx:
            verify_google_id_token(bad_iss, jwks_fetcher=fetcher)
        self.assertEqual(ctx.exception.status_code, 401)

        # Expired token fails
        expired = self._sign_jwt(self._claims_payload(exp=int(time.time()) - 5))
        with self.assertRaises(GoogleAuthError) as ctx:
            verify_google_id_token(expired, jwks_fetcher=fetcher)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.code, "token_expired")

        # Unverified email fails
        unverified = self._sign_jwt(self._claims_payload(email_verified=False))
        with self.assertRaises(GoogleAuthError) as ctx:
            verify_google_id_token(unverified, jwks_fetcher=fetcher)
        self.assertEqual(ctx.exception.status_code, 400)

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID)
    def test_new_member_registers_via_google_and_session_works(self):
        token = self._sign_jwt(self._claims_payload())
        with patch("apps.accounts.google_auth._get_jwk", return_value=self.jwks["keys"][0]):
            resp = self._post_google({"credential": token})

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "authenticated")
        self.assertTrue(data["created"])
        self.assertEqual(data["role"], "MEMBER")
        self.assertEqual(data["redirect"], "member-home.html")

        user = User.objects.get(email="newmember@gmail.com")
        self.assertEqual(user.role, Role.MEMBER)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.google_sub, "google-sub-new-123")
        self.assertIsNotNone(user.google_linked_at)
        self.assertEqual(user.first_name, "Maria")
        self.assertEqual(user.last_name, "Santos")
        self.assertEqual(user.member_profile.membership_status, MemberProfile.MembershipStatus.TRIAL)
        self.assertIsNotNone(user.member_profile.trial_ends_at)
        self.assertEqual(self.client.get("/member-home").status_code, 200)

        # Session endpoint reflects authenticated MEMBER
        sess = self.client.get("/api/auth/session/")
        self.assertEqual(sess.status_code, 200)
        self.assertEqual(sess.json()["user"]["role"], "MEMBER")

        # Member CANNOT access Admin/Staff routes
        self.assertEqual(self.client.get("/api/staff/members/").status_code, 403)
        self.assertEqual(self.client.get("/api/staff/reports/summary/").status_code, 403)

        # Logout ends the session
        csrf = self._csrf()
        out = self.client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(out.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/session/").status_code, 401)

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID)
    def test_existing_linked_member_logs_in_without_duplicate(self):
        self.member_pw.google_sub = "google-sub-linked-1"
        self.member_pw.google_linked_at = timezone.now()
        self.member_pw.save(update_fields=["google_sub", "google_linked_at"])

        token = self._sign_jwt(self._claims_payload(sub="google-sub-linked-1", email="changed.alias@gmail.com"))
        with patch("apps.accounts.google_auth._get_jwk", return_value=self.jwks["keys"][0]):
            resp = self._post_google({"credential": token})

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "authenticated")
        self.assertFalse(data["created"])
        self.assertEqual(data["user"]["id"], self.member_pw.pk)
        self.assertEqual(User.objects.filter(google_sub="google-sub-linked-1").count(), 1)

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID)
    def test_unlinked_existing_member_requires_password_verification(self):
        token = self._sign_jwt(self._claims_payload(sub="google-sub-match-1", email="existing@profit.test"))
        with patch("apps.accounts.google_auth._get_jwk", return_value=self.jwks["keys"][0]):
            resp = self._post_google({"credential": token})

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["status"], "link_required")
        self.assertEqual(body["email"], "existing@profit.test")
        self.assertTrue(body["link_token"])
        # Must NOT auto-login or auto-link before verification
        self.assertEqual(self.client.get("/api/auth/session/").status_code, 401)
        self.member_pw.refresh_from_db()
        self.assertIsNone(self.member_pw.google_sub)

        # Wrong password fails with 400
        csrf = self._csrf()
        bad_link = self.client.post(
            "/api/auth/google/link/",
            data=json.dumps({"link_token": body["link_token"], "password": "WrongPassword!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(bad_link.status_code, 400)
        self.member_pw.refresh_from_db()
        self.assertIsNone(self.member_pw.google_sub)

        # Correct password links and preserves original password
        ok_link = self.client.post(
            "/api/auth/google/link/",
            data=json.dumps({"link_token": body["link_token"], "password": "MemberPassword123!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(ok_link.status_code, 200)
        self.assertTrue(ok_link.json()["linked"])
        self.member_pw.refresh_from_db()
        self.assertEqual(self.member_pw.google_sub, "google-sub-match-1")
        self.assertTrue(self.member_pw.check_password("MemberPassword123!"))

        # Normal password login still works after linking
        out_resp = self.client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN=self._csrf())
        self.assertEqual(out_resp.status_code, 200)
        normal = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"identity": "existing@profit.test", "password": "MemberPassword123!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self._csrf(),
        )
        self.assertEqual(normal.status_code, 200)

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID)
    def test_staff_and_trainer_blocked_from_google_signin_but_keep_normal_login(self):
        for privileged in (self.owner, self.trainer):
            token = self._sign_jwt(self._claims_payload(sub=f"sub-{privileged.pk}", email=privileged.email))
            with patch("apps.accounts.google_auth._get_jwk", return_value=self.jwks["keys"][0]):
                resp = self._post_google({"credential": token})
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(resp.json()["code"], "staff_forbidden")

        # Owner still logs in normally with gym password
        csrf = self._csrf()
        owner_login = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"identity": "owner@profit.test", "password": "OwnerPassword123!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(owner_login.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["role"], "ADMIN")

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID)
    def test_cannot_link_second_google_account_or_reuse_same_google_sub(self):
        self.member_pw.google_sub = "google-sub-original"
        self.member_pw.save(update_fields=["google_sub"])

        # Same email, different google_sub -> 409 conflict
        other_sub_token = self._sign_jwt(self._claims_payload(sub="google-sub-other", email="existing@profit.test"))
        with patch("apps.accounts.google_auth._get_jwk", return_value=self.jwks["keys"][0]):
            resp = self._post_google({"credential": other_sub_token})
        self.assertEqual(resp.status_code, 409)

        # Another member trying to link a google_sub already owned by member_pw -> 409 conflict
        second_member = User.objects.create_user(
            username="second@profit.test",
            email="second@profit.test",
            password="SecondPassword123!",
            role=Role.MEMBER,
        )
        MemberProfile.objects.create(user=second_member)
        from apps.accounts.google_auth import _issue_link_token

        forged_sub_token = _issue_link_token(second_member, "google-sub-original")
        csrf = self._csrf()
        conflict = self.client.post(
            "/api/auth/google/link/",
            data=json.dumps({"link_token": forged_sub_token, "password": "SecondPassword123!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(conflict.status_code, 409)

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID, GOOGLE_CLIENT_SECRET="test-secret-only")
    def test_oauth_redirect_login_and_callback_flows(self):
        start = self.client.get("/api/auth/google/login/?source=join")
        self.assertEqual(start.status_code, 302)
        parsed = urllib.parse.urlparse(start["Location"])
        self.assertEqual(parsed.netloc, "accounts.google.com")
        qs = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(qs["scope"][0], "openid email profile")
        state = qs["state"][0]

        # Cancelled by user
        cancelled = self.client.get("/api/auth/google/callback/?error=access_denied")
        self.assertEqual(cancelled.status_code, 302)
        self.assertIn("/join.html?google_error=cancelled", cancelled["Location"])

        # Restart flow for state check + valid code exchange
        start2 = self.client.get("/api/auth/google/login/?source=login")
        state2 = urllib.parse.parse_qs(urllib.parse.urlparse(start2["Location"]).query)["state"][0]
        bad_state = self.client.get("/api/auth/google/callback/?code=abc&state=wrong-state")
        self.assertEqual(bad_state.status_code, 302)
        self.assertIn("/login.html?google_error=invalid_state", bad_state["Location"])

        # Fresh start -> valid callback creates & logs in Member
        start3 = self.client.get("/api/auth/google/login/?source=login")
        state3 = urllib.parse.parse_qs(urllib.parse.urlparse(start3["Location"]).query)["state"][0]
        from apps.accounts.google_auth import GoogleClaims

        mock_claims = GoogleClaims(
            sub="google-sub-redirect-99",
            email="redirectuser@gmail.com",
            email_verified=True,
            name="Redirect User",
        )
        with patch("api.auth.exchange_google_code", return_value=mock_claims):
            cb = self.client.get(f"/api/auth/google/callback/?code=valid-code&state={state3}")
        self.assertEqual(cb.status_code, 302)
        self.assertIn("/login.html?google_authenticated=1", cb["Location"])
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["role"], "MEMBER")

    @override_settings(ALLOWED_HOSTS=["www.functionalfitnessgym.site", "testserver"])
    def test_google_callback_url_normalizes_custom_domain(self):
        from api.auth import _google_callback_url

        rf = RequestFactory()
        req = rf.get("/api/auth/google/login/", HTTP_HOST="www.functionalfitnessgym.site", secure=True)

        with override_settings(GOOGLE_CALLBACK_URL=""):
            self.assertEqual(
                _google_callback_url(req),
                "https://www.functionalfitnessgym.site/api/auth/google/callback/",
            )

        with override_settings(GOOGLE_CALLBACK_URL="https://www.functionalfitnessgym.site"):
            self.assertEqual(
                _google_callback_url(req),
                "https://www.functionalfitnessgym.site/api/auth/google/callback/",
            )

        with override_settings(GOOGLE_CALLBACK_URL="https://www.functionalfitnessgym.site/api/auth/google/callback"):
            self.assertEqual(
                _google_callback_url(req),
                "https://www.functionalfitnessgym.site/api/auth/google/callback",
            )

        with override_settings(GOOGLE_CALLBACK_URL="https://profit-draft-gdzv.vercel.app/api/auth/google/callback/"):
            self.assertEqual(
                _google_callback_url(req),
                "https://www.functionalfitnessgym.site/api/auth/google/callback/",
            )

    @override_settings(GOOGLE_CLIENT_ID=TEST_CLIENT_ID)
    def test_verify_google_access_token_and_endpoint(self):
        def fake_get(url, headers=None, **_kwargs):
            if "tokeninfo" in url:
                return {"aud": TEST_CLIENT_ID, "azp": TEST_CLIENT_ID, "expires_in": "3600"}
            return {
                "sub": "google-oauth2-sub-77",
                "email": "mariasantos99@gmail.com",
                "email_verified": True,
                "name": "Maria Santos",
            }

        claims = verify_google_access_token("ya29.test-access-token", http_get=fake_get)
        self.assertEqual(claims.sub, "google-oauth2-sub-77")
        self.assertEqual(claims.email, "mariasantos99@gmail.com")

        # Expired / wrong audience rejected
        with self.assertRaises(GoogleAuthError):
            verify_google_access_token(
                "ya29.bad",
                http_get=lambda u, h: {"aud": "other.apps.googleusercontent.com", "expires_in": "3600"},
            )
        with self.assertRaises(GoogleAuthError):
            verify_google_access_token(
                "ya29.expired",
                http_get=lambda u, h: {"aud": TEST_CLIENT_ID, "expires_in": "0"},
            )

        # POST /api/auth/google/ accepts {access_token} and logs in as MEMBER
        with patch("apps.accounts.google_auth._google_get_json", side_effect=fake_get):
            resp = self._post_google({"access_token": "ya29.test-access-token"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "authenticated")
        self.assertEqual(resp.json()["role"], "MEMBER")
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["role"], "MEMBER")

    def test_login_page_sets_coop_allow_popups(self):
        resp = self.client.get("/login")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers.get("Cross-Origin-Opener-Policy"), "same-origin-allow-popups")

    def test_validate_real_email_rejects_fake_gmails_and_typos(self):
        self.assertEqual(validate_real_email("  MariaSantos99@gmail.com "), "mariasantos99@gmail.com")
        for bad in (
            "abc@gmail.com",
            "123456@gmail.com",
            "test@gmail.com",
            "user@gmai.com",
            "member123@mailinator.com",
        ):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                validate_real_email(bad)

        # Login & Join endpoints refuse fake/typo Gmails with 400
        csrf = self._csrf()
        login_resp = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"identity": "abc@gmail.com", "password": "SomePassword123!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(login_resp.status_code, 400)

        join_resp = self.client.post(
            "/api/join/checkout/",
            data=json.dumps({
                "plan": "monthly",
                "name": "Fake User",
                "email": "test@gmail.com",
                "phone": "09171234567",
                "password": "StrongPassword123!",
            }),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
            REMOTE_ADDR="10.0.0.99",
        )
        self.assertEqual(join_resp.status_code, 400)
