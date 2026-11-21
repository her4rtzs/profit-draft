"""POST /api/join/checkout/: public self sign-up.

Creates a MEMBER login with a 7-day trial. No payment gateway is involved.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.membership.services import register_trial_member


class JoinThrottle(AnonRateThrottle):
    scope = "join"
    rate = "10/hour"


class JoinCheckoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [JoinThrottle]

    def post(self, request):
        d = request.data
        base = settings.SITE_BASE_URL.rstrip("/")
        try:
            register_trial_member(
                name=d.get("name"),
                email=d.get("email"),
                password=d.get("password"),
                phone=d.get("phone"),
            )
        except ValidationError as exc:
            raise DRFValidationError({"detail": " ".join(exc.messages)})
        return Response({"status": "trial", "login_url": f"{base}/login"})
