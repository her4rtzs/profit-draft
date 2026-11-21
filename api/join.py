"""POST /api/join/checkout/: public self sign-up.

Creates a MEMBER login with a 7-day trial. It no longer starts a PayMongo
checkout or redirects to payment; the PayMongo code stays in ``apps.billing``
until it is removed in a later pass.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.billing.services import confirm_join
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


class JoinConfirmView(APIView):
    """POST /api/join/confirm/ {token}: legacy PayMongo return check, kept for now."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            return Response({"status": confirm_join(request.data.get("token"))})
        except ValidationError as exc:
            raise DRFValidationError({"detail": " ".join(exc.messages)})
