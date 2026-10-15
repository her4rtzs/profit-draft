"""GET /api/member/me/: one payload for the member home (profile, membership,
recent check-ins, paid invoices). Read-only and scoped to the caller."""

import base64
import binascii

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Payment
from apps.membership.models import Attendance, MemberProfile


PHOTO_PREFIX = "data:image/jpeg;base64,"
MAX_PHOTO_CHARS = 260_000  # about 190 KB of image


def _clean_photo(value):
    """Return a safe JPEG data URL, "" to clear it, or None when invalid."""
    if value == "":
        return ""
    if not isinstance(value, str) or not value.startswith(PHOTO_PREFIX) or len(value) > MAX_PHOTO_CHARS:
        return None
    try:
        raw = base64.b64decode(value[len(PHOTO_PREFIX):], validate=True)
    except (binascii.Error, ValueError):
        return None
    return value if raw[:3] == b"\xff\xd8\xff" else None  # JPEG magic bytes


class MemberMeView(APIView):
    def patch(self, request):
        """Members may update their own photo, phone and address."""
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            raise NotFound("No member profile.")
        fields = []
        if "photo" in request.data:
            photo = _clean_photo(request.data.get("photo"))
            if photo is None:
                return Response({"detail": "Send a JPEG photo under 190 KB."}, status=status.HTTP_400_BAD_REQUEST)
            profile.photo_data = photo
            fields.append("photo_data")
        for key, limit in (("phone", 30), ("address", 255)):
            if key in request.data:
                value = str(request.data.get(key) or "").strip()
                if len(value) > limit:
                    return Response({"detail": f"{key} is too long."}, status=status.HTTP_400_BAD_REQUEST)
                setattr(profile, key, value)
                fields.append(key)
        if not fields:
            return Response({"detail": "Nothing to update."}, status=status.HTTP_400_BAD_REQUEST)
        profile.save(update_fields=fields)
        return Response({"photo": profile.photo_data, "phone": profile.phone, "address": profile.address})

    def get(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            raise NotFound("No member profile.")

        visits = Attendance.objects.filter(member=profile).order_by("-check_in_date")[:30]
        paid = (Payment.objects.filter(subscription__member=profile, status=Payment.Status.PAID)
                .order_by("-created_at")[:20])
        user = request.user
        return Response({
            "user": {
                "name": user.get_full_name() or user.username, "email": user.email,
                "phone": profile.phone, "address": profile.address, "photo": profile.photo_data,
                "memberId": f"M{202600 + profile.pk}",
            },
            "membership": {
                "planName": "Membership",
                "status": profile.membership_status,
                "expiry": profile.expiry_date.isoformat() if profile.expiry_date else None,
            },
            "attendance": [{"date": v.check_in_date.isoformat(), "location": "Gym check-in"} for v in visits],
            "payments": [{
                "reference": f"PF-{p.pk:06d}",
                "date": timezone.localdate(p.created_at).isoformat(),
                "method": "Online",
                "amount_centavos": p.amount_centavos,
                "amountFormatted": f"₱{p.amount_centavos / 100:,.2f}",
            } for p in paid],
        })


class MemberCheckoutView(APIView):
    """POST /api/member/checkout/ {plan}: start an online payment for the caller."""

    def post(self, request):
        from django.conf import settings
        from django.core.exceptions import ValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError

        from apps.billing.services import CheckoutError, create_checkout

        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            raise NotFound("No member profile.")
        base = settings.SITE_BASE_URL.rstrip("/")
        try:
            url = create_checkout(
                profile,
                request.data.get("plan"),
                success_url=f"{base}/member-home.html?paid=1",
                cancel_url=f"{base}/member-home.html",
            )
        except ValidationError as exc:
            raise DRFValidationError({"detail": " ".join(exc.messages)})
        except CheckoutError as exc:
            return Response({"detail": str(exc)}, status=503)
        return Response({"checkout_url": url})
