"""GET /api/member/me/: one payload for the member home (profile, membership,
recent check-ins, paid invoices). Read-only and scoped to the caller."""

import base64
import binascii
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Payment, Subscription
from apps.membership.models import Attendance, Enrollment, MemberProfile
from apps.membership.services import PLAN_DAYS

from .permissions import MemberAccess, TrialAllowedMemberAccess


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
    permission_classes = [TrialAllowedMemberAccess]

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

        # Fetch last 90 days of attendance for streak/weekly calculations,
        # but only send the most recent 30 to the client for the list display.
        today = timezone.localdate()
        # Monday of the current ISO week (Mon=0 … Sun=6 in isoweekday)
        week_monday = today - timedelta(days=today.isoweekday() - 1)

        all_visits = list(
            Attendance.objects.filter(member=profile)
            .order_by("-check_in_date")
            .values_list("check_in_date", flat=True)[:90]
        )
        # Streak: consecutive days ending today (or yesterday if not yet checked in today)
        visit_set = set(all_visits)
        start_day = today if today in visit_set else today - timedelta(days=1)
        streak = 0
        for i in range(90):
            d = start_day - timedelta(days=i)
            if d in visit_set:
                streak += 1
            else:
                break

        # Weekly visits: distinct check-in dates in the current ISO week (Mon–Sun)
        weekly_visits = sum(1 for d in visit_set if d >= week_monday)

        visits_for_display = all_visits[:30]
        latest_sub = (
            Subscription.objects.filter(member=profile)
            .order_by("-created_at")
            .first()
        )
        latest_enrollment = (
            Enrollment.objects.filter(member=profile)
            .order_by("-end_date", "-created_at")
            .first()
        )
        all_payments = list(
            Payment.objects.select_related("subscription")
            .filter(subscription__member=profile)
            .order_by("-created_at")[:30]
        )
        latest_payment = all_payments[0] if all_payments else None

        plan_key = (latest_sub.plan or "").strip().lower() if latest_sub and latest_sub.plan else None
        plan_name = plan_key.title() if plan_key else "No active plan"
        start_date = latest_enrollment.start_date if latest_enrollment else None
        end_date = profile.expiry_date or (latest_enrollment.end_date if latest_enrollment else None)
        if plan_key and plan_key in PLAN_DAYS:
            duration_days = PLAN_DAYS[plan_key]
        elif latest_enrollment and latest_enrollment.end_date and latest_enrollment.start_date:
            duration_days = max(1, (latest_enrollment.end_date - latest_enrollment.start_date).days)
        else:
            duration_days = None

        remaining_days = max(0, (end_date - today).days) if end_date else 0
        raw_status = profile.membership_status
        if raw_status == MemberProfile.MembershipStatus.TRIAL:
            effective_status = "TRIAL"
        elif raw_status == MemberProfile.MembershipStatus.PENDING and not end_date:
            effective_status = "PENDING"
        elif end_date and end_date < today:
            effective_status = "EXPIRED"
        elif raw_status == MemberProfile.MembershipStatus.EXPIRED:
            effective_status = "EXPIRED"
        elif end_date and (end_date - today).days <= 7:
            effective_status = "EXPIRING_SOON"
        else:
            effective_status = "ACTIVE"

        user = request.user
        return Response({
            "user": {
                "name": user.get_full_name() or user.username, "email": user.email,
                "phone": profile.phone, "address": profile.address, "photo": profile.photo_data,
                "memberId": f"M{202600 + profile.pk}",
            },
            "membership": {
                "plan": plan_key,
                "planName": plan_name,
                "status": effective_status,
                "rawStatus": raw_status,
                "expiringSoon": effective_status == "EXPIRING_SOON",
                "startDate": start_date.isoformat() if start_date else None,
                "endDate": end_date.isoformat() if end_date else None,
                "expiry": end_date.isoformat() if end_date else None,
                "durationDays": duration_days,
                "remainingDays": remaining_days,
                "paymentStatus": latest_payment.status if latest_payment else "NONE",
            },
            # attendance: YYYY-MM-DD strings (localdate) — no UTC shift on the client
            "attendance": [{"date": d.isoformat(), "location": "Gym check-in"} for d in visits_for_display],
            # streak/weekly are pre-computed server-side so the client doesn't
            # have to recalculate from an incomplete 30-record window
            "streak": streak,
            "weeklyVisits": weekly_visits,
            "payments": [{
                "reference": f"PF-{p.pk:06d}",
                "date": timezone.localdate(p.created_at).isoformat(),
                "method": "Online",
                "status": p.status,
                "plan": (p.subscription.plan.title() if p.subscription and p.subscription.plan else "Membership"),
                "durationDays": PLAN_DAYS.get((p.subscription.plan or "").lower()) if p.subscription else None,
                "amount_centavos": p.amount_centavos,
                "amountFormatted": f"₱{p.amount_centavos / 100:,.2f}",
            } for p in all_payments],
        })


class MemberCheckoutView(APIView):
    """POST /api/member/checkout/ {plan}: start an online payment for the caller."""
    permission_classes = [MemberAccess]

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


class MemberCheckInView(APIView):
    """POST /api/member/check-in/: self check-in for the authenticated member."""
    permission_classes = [MemberAccess]

    def post(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from apps.membership.services import check_in_member

        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            raise NotFound("No member profile.")
        try:
            record = check_in_member(profile, recorded_by=request.user)
        except DjangoValidationError as exc:
            return Response(
                {"detail": " ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            "status": "ok",
            "attendance": {
                "date": record.check_in_date.isoformat(),
                "location": "Gym check-in",
            },
        })
