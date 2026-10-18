"""Checkout creation (PayMongo call mocked) and webhook activation of the membership."""

import hashlib
import hmac
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings

from apps.billing.models import Payment, Subscription
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
class JoinPayFirstTests(TestCase):
    """Pay first: no account exists until the confirmed payment arrives."""

    BODY = {"name": "New Person", "email": "New@Example.com", "phone": "09120000000",
            "plan": "monthly", "password": "Strong-pass-987"}

    def _join(self, body=None):
        fake = _Resp({"data": {"id": "cs_join_1", "attributes": {"checkout_url": "https://pay.example/cs_join_1"}}})
        with mock.patch("apps.billing.services.urllib.request.urlopen", return_value=fake):
            return Client().post("/api/join/checkout/", data=json.dumps(body or self.BODY), content_type="application/json")

    def _webhook(self, event_id, session="cs_join_1"):
        payload = {"data": {"id": event_id, "attributes": {"type": "checkout_session.payment.paid", "livemode": False, "data": {"id": session}}}}
        raw = json.dumps(payload).encode()
        t = "1700000000"
        sig = hmac.new(SECRET.encode(), t.encode() + b"." + raw, hashlib.sha256).hexdigest()
        return Client().post("/webhooks/paymongo/", data=raw, content_type="application/json", HTTP_PAYMONGO_SIGNATURE=f"t={t},te={sig},li=")

    def test_no_account_before_payment(self):
        resp = self._join()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["checkout_url"], "https://pay.example/cs_join_1")
        self.assertFalse(User.objects.filter(username="new@example.com").exists())

    def test_paid_webhook_creates_active_member_who_can_log_in(self):
        self._join()
        self.assertEqual(self._webhook("evt_j1").status_code, 200)
        user = User.objects.get(username="new@example.com")
        self.assertEqual(user.role, "MEMBER")
        self.assertTrue(user.check_password("Strong-pass-987"))
        profile = MemberProfile.objects.get(user=user)
        self.assertEqual(profile.membership_status, "ACTIVE")
        self.assertEqual(Payment.objects.get(paymongo_payment_id="cs_join_1").status, Payment.Status.PAID)

    def test_redelivery_does_not_duplicate(self):
        self._join()
        self._webhook("evt_j1")
        self._webhook("evt_j2")
        self.assertEqual(User.objects.filter(username="new@example.com").count(), 1)
        self.assertEqual(Payment.objects.filter(paymongo_payment_id="cs_join_1").count(), 1)

    def test_existing_email_is_refused(self):
        User.objects.create_user(username="new@example.com", email="new@example.com", password="x-Pass-12345")
        self.assertEqual(self._join().status_code, 400)

    def test_weak_password_and_bad_plan_are_refused(self):
        self.assertEqual(self._join({**self.BODY, "password": "123"}).status_code, 400)
        self.assertEqual(self._join({**self.BODY, "plan": "platinum"}).status_code, 400)


@override_settings(PAYMONGO_SECRET_KEY="sk_test_dummy", PAYMONGO_WEBHOOK_SECRET=SECRET)
class JoinConfirmTests(TestCase):
    """The return-from-payment check works even if the webhook never arrives."""

    BODY = {"name": "Back Up", "email": "backup@example.com", "phone": "09120000000",
            "plan": "monthly", "password": "Strong-pass-987"}

    def _join(self):
        fake = _Resp({"data": {"id": "cs_c1", "attributes": {"checkout_url": "https://pay.example/cs_c1"}}})
        with mock.patch("apps.billing.services.urllib.request.urlopen", return_value=fake) as m:
            resp = Client().post("/api/join/checkout/", data=json.dumps(self.BODY), content_type="application/json")
        self.assertEqual(resp.status_code, 200)
        sent = json.loads(m.call_args[0][0].data.decode())
        return sent["data"]["attributes"]["success_url"].split("t=")[-1]

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
