"""Public read and Owner-only update endpoints for membership plan prices."""

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.services import (
    PLAN_DAYS,
    get_plan_prices_centavos,
    update_plan_prices,
)

from .permissions import IsActiveOwner


def _serialize_plans(prices_centavos):
    labels = {
        "daily": "Daily",
        "monthly": "Monthly",
        "quarterly": "Quarterly",
        "annual": "Annual",
    }
    return {
        "plans": {
            key: {
                "label": labels[key],
                "days": PLAN_DAYS[key],
                "price": prices_centavos[key] // 100,
                "price_centavos": prices_centavos[key],
            }
            for key in ("daily", "monthly", "quarterly", "annual")
        }
    }


class PublicPlanPricesView(APIView):
    """Read-only public endpoint returning live membership plan prices."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(_serialize_plans(get_plan_prices_centavos()))


class StaffPlanPricesView(APIView):
    """Owner-only endpoint for updating membership plan prices."""

    permission_classes = [IsActiveOwner]

    def get(self, request):
        return Response(_serialize_plans(get_plan_prices_centavos()))

    def patch(self, request):
        raw = request.data.get("plans") if isinstance(request.data, dict) and "plans" in request.data else request.data
        try:
            updated = update_plan_prices(raw, updated_by=request.user)
        except ValidationError as exc:
            msg = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize_plans(updated))
