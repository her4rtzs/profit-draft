"""GET /api/member/me/: one payload for the member home (profile, membership,
recent check-ins, paid invoices). Read-only and scoped to the caller."""

from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Payment
from apps.membership.models import Attendance, MemberProfile


class MemberMeView(APIView):
    def get(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            raise NotFound("No member profile.")

        visits = Attendance.objects.filter(member=profile).order_by("-check_in_date")[:30]
        paid = (Payment.objects.filter(subscription__member=profile, status=Payment.Status.PAID)
                .order_by("-created_at")[:20])
        user = request.user
        return Response({
            "user": {"name": user.get_full_name() or user.username, "email": user.email, "phone": ""},
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
