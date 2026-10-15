"""Authoritative PayMongo webhook suite (FEAT-004).

Covers the four Revision 4 binding fixes end to end:

- SIGNATURE: a self-generated ``(secret, t, body)`` triple with the matching
  HMAC passes; the signed message is byte-exact ``t.encode() + b'.' + raw_body``;
  test mode compares ``te`` and live mode compares ``li`` (livemode-driven); a
  tampered body fails; a malformed/missing header fails; the raw body is hashed
  without being decoded first.
- IDEMPOTENCY / CONTRACT: valid + new -> 200 + transition + PROCESSED; a
  DUPLICATE PROCESSED delivery -> 200 no-op with the single-writer mutator NOT
  called again (spy) and no extra WebhookEvent row; the CONCURRENT-INSERT
  ``IntegrityError`` path -> the second delivery is a 200 no-op; UNKNOWN_PAYMENT
  then a retry after the Payment exists -> transitions and becomes PROCESSED
  (the race fix); an unrecognized event type -> 200 + IGNORED with a redelivery
  short-circuiting as a terminal duplicate; an INVALID signature -> 400 with NO
  WebhookEvent row written at all.
"""

import hashlib
import hmac
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase, override_settings

from apps.billing.models import Payment, Subscription, WebhookEvent
from apps.billing.webhooks import verify_signature
from apps.membership.models import MemberProfile

User = get_user_model()

WEBHOOK_URL = "/webhooks/paymongo/"
SECRET = "whsk_test_dummy"


def _sign(raw_body: bytes, t: str, secret: str) -> str:
    """Produce the hex digest the webhook expects, matching the binding scheme."""
    message = t.encode() + b"." + raw_body
    return hmac.new(secret.encode(), msg=message, digestmod=hashlib.sha256).hexdigest()


def _event_payload(event_id, event_type, payment_id=None, livemode=False):
    inner = {}
    if payment_id is not None:
        inner = {"id": payment_id}
    return {
        "data": {
            "id": event_id,
            "attributes": {
                "type": event_type,
                "livemode": livemode,
                "data": inner,
            },
        }
    }


def _make_payment(pm_id):
    user = User.objects.create_user(username=f"u_{pm_id}", password="x")
    profile = MemberProfile.objects.create(user=user)
    sub = Subscription.objects.create(member=profile, amount_centavos=10000)
    return Payment.objects.create(
        subscription=sub,
        amount_centavos=10000,
        status=Payment.Status.PENDING,
        paymongo_payment_id=pm_id,
    )


class VerifySignatureTests(TestCase):
    def test_valid_test_mode_signature_passes(self):
        raw = b'{"hello":"world"}'
        t = "1700000000"
        header = f"t={t},te={_sign(raw, t, SECRET)},li=deadbeef"
        self.assertTrue(verify_signature(raw, header, SECRET, mode="test"))

    def test_signed_message_is_byte_exact(self):
        # The implementation must hash exactly t.encode() + b"." + raw_body.
        raw = b'{"a":1}'
        t = "1699999999"
        expected = hmac.new(
            SECRET.encode(),
            msg=t.encode() + b"." + raw,
            digestmod=hashlib.sha256,
        ).hexdigest()
        header = f"t={t},te={expected},li=deadbeef"
        self.assertTrue(verify_signature(raw, header, SECRET, mode="test"))
        # A digest computed over a decoded/re-encoded body with a different
        # separator must NOT validate, proving the exact framing is enforced.
        wrong = hmac.new(
            SECRET.encode(),
            msg=t.encode() + b":" + raw,
            digestmod=hashlib.sha256,
        ).hexdigest()
        self.assertFalse(
            verify_signature(raw, f"t={t},te={wrong},li=x", SECRET, mode="test")
        )

    def test_empty_secret_fails(self):
        raw = b"{}"
        t = "1"
        header = f"t={t},te={_sign(raw, t, SECRET)},li=x"
        self.assertFalse(verify_signature(raw, header, "", mode="test"))

    def test_test_mode_rejects_live_only_signature(self):
        # A signature present only in ``li`` must not satisfy test mode.
        raw = b'{"x":1}'
        t = "1700000000"
        header = f"t={t},te=deadbeef,li={_sign(raw, t, SECRET)}"
        self.assertFalse(verify_signature(raw, header, SECRET, mode="test"))

    def test_tampered_body_fails(self):
        raw = b'{"hello":"world"}'
        t = "1700000000"
        header = f"t={t},te={_sign(raw, t, SECRET)},li=deadbeef"
        self.assertFalse(verify_signature(b'{"hello":"evil"}', header, SECRET, mode="test"))

    def test_malformed_header_fails(self):
        self.assertFalse(verify_signature(b"{}", "not-a-signature-header", SECRET, mode="test"))

    def test_missing_header_fails(self):
        self.assertFalse(verify_signature(b"{}", "", SECRET, mode="test"))

    def test_live_mode_uses_li_field(self):
        raw = b'{"hello":"world"}'
        t = "1700000000"
        header = f"t={t},te=deadbeef,li={_sign(raw, t, SECRET)}"
        self.assertTrue(verify_signature(raw, header, SECRET, mode="live"))

    def test_raw_body_hashed_without_decoding(self):
        # A non-UTF-8 byte sequence still hashes (never decoded before hashing).
        raw = b"\xff\xfe raw bytes"
        t = "1700000000"
        header = f"t={t},te={_sign(raw, t, SECRET)},li=x"
        self.assertTrue(verify_signature(raw, header, SECRET, mode="test"))


@override_settings(PAYMONGO_WEBHOOK_SECRET=SECRET)
class WebhookViewTests(TestCase):
    def _post(self, payload):
        raw = json.dumps(payload).encode("utf-8")
        t = "1700000000"
        header = f"t={t},te={_sign(raw, t, SECRET)},li=unused"
        return self.client.post(
            WEBHOOK_URL,
            data=raw,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=header,
        )

    def test_valid_paid_event_processes(self):
        payment = _make_payment("pm_ok")
        payload = _event_payload("evt_1", "payment.paid", payment_id="pm_ok")
        resp = self._post(payload)
        self.assertEqual(resp.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertEqual(
            WebhookEvent.objects.get(event_id="evt_1").status,
            WebhookEvent.Status.PROCESSED,
        )

    def test_bad_signature_writes_no_row_and_400(self):
        payload = _event_payload("evt_bad", "payment.paid", payment_id="pm_x")
        raw = json.dumps(payload).encode("utf-8")
        resp = self.client.post(
            WEBHOOK_URL,
            data=raw,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE="t=1,te=wrong,li=wrong",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(WebhookEvent.objects.filter(event_id="evt_bad").exists())

    def test_unknown_payment_is_200_and_reprocessable(self):
        payload = _event_payload("evt_unk", "payment.paid", payment_id="pm_later")
        resp = self._post(payload)
        self.assertEqual(resp.status_code, 200)
        event = WebhookEvent.objects.get(event_id="evt_unk")
        self.assertEqual(event.status, WebhookEvent.Status.UNKNOWN_PAYMENT)

        # Payment now exists; a retry of the same event id reprocesses.
        payment = _make_payment("pm_later")
        resp2 = self._post(payload)
        self.assertEqual(resp2.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)
        event.refresh_from_db()
        self.assertEqual(event.status, WebhookEvent.Status.PROCESSED)

    def test_duplicate_processed_event_short_circuits(self):
        payment = _make_payment("pm_dup")
        payload = _event_payload("evt_dup", "payment.paid", payment_id="pm_dup")
        self._post(payload)
        # Flip the payment behind the webhook's back; a true duplicate must NOT
        # re-apply, so the status we set here survives.
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status"])
        resp = self._post(payload)
        self.assertEqual(resp.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)

    def test_duplicate_processed_does_not_recall_mutator_and_writes_no_row(self):
        # First delivery processes and records exactly one WebhookEvent row.
        _make_payment("pm_spy")
        payload = _event_payload("evt_spy", "payment.paid", payment_id="pm_spy")
        resp1 = self._post(payload)
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(WebhookEvent.objects.filter(event_id="evt_spy").count(), 1)

        # A duplicate delivery must short-circuit: the single-writer mutator is
        # NOT called again, and no second WebhookEvent row is written.
        with mock.patch(
            "apps.billing.webhooks.mark_payment_paid"
        ) as spy_paid, mock.patch(
            "apps.billing.webhooks.mark_payment_failed"
        ) as spy_failed:
            resp2 = self._post(payload)
        self.assertEqual(resp2.status_code, 200)
        spy_paid.assert_not_called()
        spy_failed.assert_not_called()
        self.assertEqual(WebhookEvent.objects.filter(event_id="evt_spy").count(), 1)
        self.assertEqual(
            WebhookEvent.objects.get(event_id="evt_spy").status,
            WebhookEvent.Status.PROCESSED,
        )

    def test_concurrent_insert_integrityerror_is_200_noop(self):
        # Simulate a concurrent delivery winning the unique event_id race:
        # get_or_create raises IntegrityError (as it would when a competing
        # transaction inserted the same event_id first), and the already-winning
        # row is terminal (PROCESSED). The except-IntegrityError branch must
        # re-read it and return a 200 no-op without re-applying the mutator.
        _make_payment("pm_race")
        payload = _event_payload("evt_race", "payment.paid", payment_id="pm_race")

        # Pre-create the terminal "winner" row the competing transaction wrote.
        WebhookEvent.objects.create(
            event_id="evt_race", status=WebhookEvent.Status.PROCESSED
        )

        def _raise_integrityerror(*args, **kwargs):
            raise IntegrityError("duplicate key value violates unique constraint")

        with mock.patch(
            "apps.billing.webhooks.mark_payment_paid"
        ) as spy_paid, mock.patch.object(
            WebhookEvent.objects, "get_or_create", side_effect=_raise_integrityerror
        ):
            resp = self._post(payload)

        self.assertEqual(resp.status_code, 200)
        # Terminal duplicate: the mutator is not called in the recovery branch.
        spy_paid.assert_not_called()
        # Still exactly one row; the recovery re-read the winner, inserted nothing.
        self.assertEqual(WebhookEvent.objects.filter(event_id="evt_race").count(), 1)
        self.assertEqual(
            WebhookEvent.objects.get(event_id="evt_race").status,
            WebhookEvent.Status.PROCESSED,
        )

    def test_unrecognized_event_type_ignored_and_redelivery_is_terminal(self):
        payload = _event_payload("evt_ign", "source.chargeable")
        resp = self._post(payload)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            WebhookEvent.objects.get(event_id="evt_ign").status,
            WebhookEvent.Status.IGNORED,
        )
        # IGNORED is terminal: a redelivery short-circuits as a duplicate 200
        # and writes no second row.
        resp2 = self._post(payload)
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(WebhookEvent.objects.filter(event_id="evt_ign").count(), 1)
        self.assertEqual(
            WebhookEvent.objects.get(event_id="evt_ign").status,
            WebhookEvent.Status.IGNORED,
        )

    def test_unparseable_body_is_400(self):
        resp = self.client.post(
            WEBHOOK_URL,
            data=b"not json",
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE="t=1,te=x,li=x",
        )
        self.assertEqual(resp.status_code, 400)

    def test_get_is_rejected(self):
        resp = self.client.get(WEBHOOK_URL)
        self.assertEqual(resp.status_code, 405)
