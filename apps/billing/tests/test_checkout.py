"""Public join sign-up: it creates a trial member and starts no payment."""

import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from apps.billing.models import Payment, PendingSignup
from apps.membership.models import MemberProfile

User = get_user_model()


class JoinSignupTests(TestCase):
    """Self sign-up creates a MEMBER in TRIAL and never creates a payment."""

    BODY = {
        "name": "New Person",
        "email": "New@Example.com",
        "phone": "09120000000",
        "password": "Strong-pass-987",
    }

    def _join(self, body=None):
        return Client().post(
            "/api/join/checkout/",
            data=json.dumps(body or self.BODY),
            content_type="application/json",
        )

    def test_creates_trial_member_without_payment(self):
        resp = self._join()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "trial")
        user = User.objects.get(username="new@example.com")
        self.assertEqual(user.role, "MEMBER")
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password("Strong-pass-987"))
        profile = MemberProfile.objects.get(user=user)
        self.assertEqual(profile.membership_status, "TRIAL")
        self.assertIsNotNone(profile.trial_ends_at)
        self.assertEqual(Payment.objects.count(), 0)
        self.assertEqual(PendingSignup.objects.count(), 0)

    def test_trial_ends_seven_days_out(self):
        before = timezone.now()
        self._join()
        after = timezone.now()
        profile = MemberProfile.objects.get(user__username="new@example.com")
        self.assertGreaterEqual(profile.trial_ends_at, before + timedelta(days=7))
        self.assertLessEqual(profile.trial_ends_at, after + timedelta(days=7))

    def test_role_in_request_is_ignored(self):
        self.assertEqual(self._join({**self.BODY, "role": "OWNER"}).status_code, 200)
        self.assertEqual(User.objects.get(username="new@example.com").role, "MEMBER")

    def test_existing_email_is_refused(self):
        User.objects.create_user(
            username="new@example.com", email="new@example.com", password="x-Pass-12345"
        )
        self.assertEqual(self._join().status_code, 400)

    def test_weak_password_is_refused(self):
        self.assertEqual(self._join({**self.BODY, "password": "123"}).status_code, 400)

    def test_invalid_phone_is_refused(self):
        self.assertEqual(self._join({**self.BODY, "phone": "123"}).status_code, 400)
        self.assertEqual(self._join({**self.BODY, "phone": ""}).status_code, 400)

    def test_short_name_is_refused(self):
        self.assertEqual(self._join({**self.BODY, "name": "A"}).status_code, 400)
