"""Checkout creation (PayMongo call mocked) and webhook activation of the membership."""

import datetime
import hashlib
import hmac
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from apps.billing.models import Payment, PendingSignup, Subscription
from apps.membership.models import MemberProfile

User = get_user_model()
SECRET = "whsk_test_dummy"


class _Resp:
    def __init__(self, body):
        self._b = json.dumps(body).encode()

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@override_settings(PAYMONGO_SECRET_KEY="sk_test_dummy", PAYMONGO_WEBHOOK_SECRET=SECRET)
class CheckoutFlowTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        user = User.objects.create_user(username="m@example.com", email="m@example.com", password="Pass-word-123!")
        self.profile = MemberProfile.objects.get_or_create(user=user)[0]
        self.profile.membership_status = MemberProfile.MembershipStatus.ACTIVE
        self.profile.save(update_fields=["membership_status"])

    def _token(self):
        return self.client.get("/api/auth/csrf/").cookies["csrftoken"].value

    def _post(self, url, body):
        return self.client.post(url, data=json.dumps(body), content_type="application/json", HTTP_X_CSRFTOKEN=self._token())

    def _start(self, plan="monthly"):
        self._post("/api/auth/login/", {"username": "m@example.com", "password": "Pass-word-123!"})
        fake = _Resp({"data": {"id": "cs_test_1", "attributes": {"checkout_url": "https://pay.example/cs_test_1"}}})
        with mock.patch("apps.billing.services.urllib.request.urlopen", return_value=fake):
            return self._post("/api/member/checkout/", {"plan": plan})

    def _webhook(self, event_id):
        payload = {"data": {"id": event_id, "attributes": {"type": "checkout_session.payment.paid", "livemode": False, "data": {"id": "cs_test_1"}}}}
        raw = json.dumps(payload).encode()
        t = "1700000000"
        sig = hmac.new(SECRET.encode(), t.encode() + b"." + raw, hashlib.sha256).hexdigest()
        return Client().post("/webhooks/paymongo/", data=raw, content_type="application/json", HTTP_PAYMONGO_SIGNATURE=f"t={t},te={sig},li=")

    def test_checkout_creates_pending_payment_and_returns_url(self):
        resp = self._start()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["checkout_url"], "https://pay.example/cs_test_1")
        pay = Payment.objects.get(paymongo_payment_id="cs_test_1")
        self.assertEqual(pay.status, Payment.Status.PENDING)
        self.assertEqual(pay.amount_centavos, 80_000)

    def test_unknown_plan_is_rejected(self):
        self.assertEqual(self._start("platinum").status_code, 400)

    def test_paid_webhook_activates_membership_once(self):
        self._start()
        self.assertEqual(self._webhook("evt_1").status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_status, "ACTIVE")
        first_expiry = self.profile.expiry_date
        self.assertEqual(Payment.objects.get(paymongo_payment_id="cs_test_1").status, Payment.Status.PAID)
        self.assertEqual(Subscription.objects.get().status, Subscription.Status.ACTIVE)
        self._webhook("evt_2")  # redelivery under a new event id must not extend it
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.expiry_date, first_expiry)


@override_settings(PAYMONGO_SECRET_KEY="sk_test_dummy", PAYMONGO_WEBHOOK_SECRET=SECRET)
class JoinSignupTests(TestCase):
    """Self sign-up creates a MEMBER in TRIAL and never calls PayMongo."""

    BODY = {"name": "New Person", "email": "New@Example.com", "phone": "09120000000",
            "password": "Strong-pass-987"}

    def _join(self, body=None):
        return Client().post("/api/join/checkout/", data=json.dumps(body or self.BODY),
                             content_type="application/json")

    def test_creates_trial_member_without_payment(self):
        with mock.patch("apps.billing.services.urllib.request.urlopen") as urlopen:
            resp = self._join()
        urlopen.assert_not_called()
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
        self.assertGreaterEqual(profile.trial_ends_at, before + datetime.timedelta(days=7))
        self.assertLessEqual(profile.trial_ends_at, after + datetime.timedelta(days=7))

    def test_role_in_request_is_ignored(self):
        self.assertEqual(self._join({**self.BODY, "role": "OWNER"}).status_code, 200)
        self.assertEqual(User.objects.get(username="new@example.com").role, "MEMBER")

    def test_existing_email_is_refused(self):
        User.objects.create_user(username="new@example.com", email="new@example.com", password="x-Pass-12345")
        self.assertEqual(self._join().status_code, 400)

    def test_weak_password_is_refused(self):
        self.assertEqual(self._join({**self.BODY, "password": "123"}).status_code, 400)

    def test_invalid_phone_is_refused(self):
        self.assertEqual(self._join({**self.BODY, "phone": "123"}).status_code, 400)
        self.assertEqual(self._join({**self.BODY, "phone": ""}).status_code, 400)

    def test_short_name_is_refused(self):
        self.assertEqual(self._join({**self.BODY, "name": "A"}).status_code, 400)


@override_settings(PAYMONGO_SECRET_KEY="sk_test_dummy", PAYMONGO_WEBHOOK_SECRET=SECRET)
class JoinConfirmTests(TestCase):
    """The return-from-payment check works even if the webhook never arrives."""

    def _join(self):
        """Seed the legacy row the old checkout used to create."""
        PendingSignup.objects.create(
            checkout_session_id="cs_c1",
            token="tok_c1",
            name="Back Up",
            email="backup@example.com",
            phone="09120000000",
            plan="monthly",
            password_hash=make_password("Strong-pass-987"),
        )
        return "tok_c1"

    def _confirm(self, token, paid):
        attrs = {"payments": [{"attributes": {"status": "paid" if paid else "pending"}}]}
        fake = _Resp({"data": {"attributes": attrs}})
        with mock.patch("apps.billing.services.urllib.request.urlopen", return_value=fake):
            return Client().post("/api/join/confirm/", data=json.dumps({"token": token}), content_type="application/json")

    def test_unpaid_session_creates_nothing(self):
        token = self._join()
        self.assertEqual(self._confirm(token, paid=False).json()["status"], "pending")
        self.assertFalse(User.objects.filter(username="backup@example.com").exists())

    def test_paid_session_creates_active_account_once(self):
        token = self._join()
        self.assertEqual(self._confirm(token, paid=True).json()["status"], "active")
        self.assertEqual(self._confirm(token, paid=True).json()["status"], "active")
        user = User.objects.get(username="backup@example.com")
        self.assertTrue(user.check_password("Strong-pass-987"))
        self.assertEqual(MemberProfile.objects.get(user=user).membership_status, "ACTIVE")
        self.assertEqual(Payment.objects.filter(paymongo_payment_id="cs_c1").count(), 1)

    def test_unknown_token_is_rejected(self):
        self.assertEqual(self._confirm("nope", paid=True).status_code, 400)
