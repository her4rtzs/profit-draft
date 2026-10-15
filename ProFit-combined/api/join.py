"""POST /api/join/checkout/: pay first, account after. Public (no login needed).

Creates only a pending signup and a PayMongo checkout. The account is created by
the webhook once the payment is confirmed.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.billing.services import CheckoutError, create_join_checkout


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
            url = create_join_checkout(
                name=d.get("name"), email=d.get("email"), phone=d.get("phone"),
                plan=d.get("plan"), password=d.get("password"),
                success_url=f"{base}/join.html?paid=1",
                cancel_url=f"{base}/join.html?cancelled=1",
            )
        except ValidationError as exc:
            raise DRFValidationError({"detail": " ".join(exc.messages)})
        except CheckoutError as exc:
            return Response({"detail": str(exc)}, status=503)
        return Response({"checkout_url": url})
