"""PayMongo webhook receiver — the ONLY place payment paid/failed is written.

This implements the four Revision 4 BINDING fixes exactly:

1. Signature: byte-exact HMAC-SHA256 over ``t.encode() + b'.' + raw_body`` keyed
   by ``PAYMONGO_WEBHOOK_SECRET``. The raw body is NEVER decoded before hashing.
   ``te`` is compared in test mode, ``li`` in live mode; mode is selected from
   the payload ``livemode`` boolean, defaulting to test when it cannot be read
   offline. Comparison is constant-time via ``hmac.compare_digest``.
2. Race-safe idempotency: ``get_or_create`` + an ALWAYS-executed
   ``select_for_update`` re-read inside ``transaction.atomic()``, wrapped in
   ``try/except IntegrityError`` so a concurrent insert on the unique
   ``event_id`` is recovered by re-reading the winning row.
3. Single-writer: paid/failed transitions go only through
   ``services.mark_payment_paid`` / ``services.mark_payment_failed``.
4. Event-type map with 200/400 responses as specified.

LOGGING POLICY: log only the event id and the outcome enum — never the body,
amounts, PayMongo IDs beyond the event id, or any payload field.
"""

import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import Payment, WebhookEvent
from .services import mark_payment_failed, mark_payment_paid

logger = logging.getLogger("profit.billing.webhook")

# PayMongo signature header name.
_SIGNATURE_HEADER = "HTTP_PAYMONGO_SIGNATURE"


def verify_signature(raw_body: bytes, header: str, secret: str, *, mode: str) -> bool:
    """Verify a PayMongo webhook signature over the raw request body.

    The header is ``t=<unix_ts>,te=<hex>,li=<hex>`` (comma-separated). The signed
    message is ``t.encode() + b'.' + raw_body`` — the raw body bytes are hashed
    directly and are NEVER decoded first. The expected digest is compared with
    ``hmac.compare_digest`` against ``te`` in test mode and ``li`` in live mode.

    Returns ``False`` for any malformed/missing header rather than raising.
    """
    if not header or not secret:
        return False

    parts = {}
    for segment in header.split(","):
        key, sep, value = segment.partition("=")
        if not sep:
            return False
        parts[key.strip()] = value.strip()

    t = parts.get("t")
    if not t:
        return False
    expected_sig = parts.get("te") if mode == "test" else parts.get("li")
    if not expected_sig:
        return False

    # Byte-exact: never decode raw_body before hashing.
    message = t.encode() + b"." + raw_body
    computed = hmac.new(
        secret.encode(),
        msg=message,
        digestmod=hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, expected_sig)


def _extract_event_id(payload):
    """Best-effort pull of the event id for logging/idempotency; None if absent."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if isinstance(data, dict):
        event_id = data.get("id")
        if event_id:
            return event_id
    return payload.get("id")


def _extract_event_type(payload):
    """Pull the event type (e.g. 'payment.paid') from the payload; None if absent."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if isinstance(data, dict):
        attributes = data.get("attributes")
        if isinstance(attributes, dict):
            return attributes.get("type")
    return None


def _extract_payment_id(payload):
    """Pull the referenced PayMongo payment id from the payload; None if absent."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if isinstance(data, dict):
        attributes = data.get("attributes")
        if isinstance(attributes, dict):
            inner = attributes.get("data")
            if isinstance(inner, dict):
                return inner.get("id")
    return None


def _select_mode(payload):
    """Select 'live' or 'test' from the payload ``livemode``, defaulting to test."""
    livemode = None
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict):
            attributes = data.get("attributes")
            if isinstance(attributes, dict):
                livemode = attributes.get("livemode")
    return "live" if livemode is True else "test"


def _apply_event(event, payload):
    """Resolve the event type and apply the transition, setting event.status.

    Runs inside the caller's atomic block. The webhook is the sole writer of
    paid/failed, routed through the single-writer mutators.
    """
    event_type = _extract_event_type(payload)

    if event_type in ("payment.paid", "payment.failed"):
        payment_id = _extract_payment_id(payload)
        payment = (
            Payment.objects.filter(paymongo_payment_id=payment_id).first()
            if payment_id
            else None
        )
        if payment is None:
            # No matching Payment yet — reprocessable on a later retry.
            event.status = WebhookEvent.Status.UNKNOWN_PAYMENT
        else:
            if event_type == "payment.paid":
                mark_payment_paid(payment)
            else:
                mark_payment_failed(payment)
            event.status = WebhookEvent.Status.PROCESSED
    else:
        # Unrecognized event type — terminal, no payment transition.
        event.status = WebhookEvent.Status.IGNORED

    event.save(update_fields=["status"])


@csrf_exempt
@require_POST
def paymongo_webhook(request):
    """Receive and process a PayMongo webhook event.

    Returns 400 (with NO WebhookEvent row written) on a bad/missing signature or
    unparseable body; 200 for an applied transition, an unknown payment, an
    ignored event type, or a terminal duplicate.
    """
    raw_body = request.body
    header = request.META.get(_SIGNATURE_HEADER, "")

    # Parse the body first so we can select the mode and extract the event id.
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        # Unparseable body: cannot verify or identify — reject, write no row.
        logger.warning("paymongo_webhook rejected: unparseable body")
        return HttpResponseBadRequest()

    mode = _select_mode(payload)
    secret = getattr(settings, "PAYMONGO_WEBHOOK_SECRET", "")

    event_id = _extract_event_id(payload)

    if not verify_signature(raw_body, header, secret, mode=mode):
        # Bad/missing signature: write NO row; log only the event id if present.
        logger.warning(
            "paymongo_webhook rejected: signature mismatch (event_id=%s)", event_id
        )
        return HttpResponseBadRequest()

    if not event_id:
        # Signature passed but we cannot identify the event: cannot dedupe.
        logger.warning("paymongo_webhook rejected: missing event id")
        return HttpResponseBadRequest()

    terminal = (WebhookEvent.Status.PROCESSED, WebhookEvent.Status.IGNORED)

    try:
        with transaction.atomic():
            event, created = WebhookEvent.objects.get_or_create(
                event_id=event_id,
                defaults={"status": WebhookEvent.Status.UNKNOWN_PAYMENT},
            )
            # ALWAYS re-read under a row lock so concurrent retries serialize.
            event = WebhookEvent.objects.select_for_update().get(pk=event.pk)
            if not created and event.status in terminal:
                logger.info(
                    "paymongo_webhook duplicate (event_id=%s outcome=%s)",
                    event_id,
                    event.status,
                )
                return HttpResponse(status=200)
            _apply_event(event, payload)
    except IntegrityError:
        # A concurrent insert won the unique event_id race: re-read the winner.
        with transaction.atomic():
            event = WebhookEvent.objects.select_for_update().get(event_id=event_id)
            if event.status in terminal:
                logger.info(
                    "paymongo_webhook duplicate (event_id=%s outcome=%s)",
                    event_id,
                    event.status,
                )
                return HttpResponse(status=200)
            _apply_event(event, payload)

    logger.info(
        "paymongo_webhook handled (event_id=%s outcome=%s)", event_id, event.status
    )
    return HttpResponse(status=200)
