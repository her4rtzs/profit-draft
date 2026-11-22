"""Member GCash payments: submit a plan, a reference number and a Drive link.

The server supplies the member, amount, method and status. The Drive link is
stored as text and never opened by this server.
"""

from urllib.parse import urlparse

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import PaymentClaim
from apps.finance.services import (
    PLAN_PRICE_CENTAVOS,
    get_plan_price_centavos,
    normalize_gcash_reference,
    reference_in_use,
)
from apps.membership.models import MemberProfile
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .permissions import TrialAllowedMemberAccess

ALLOWED_HOSTS = {"drive.google.com", "docs.google.com"}
MAX_PENDING_CLAIMS = 3
SUBMIT_FIELDS = {"plan", "reference_number", "proof_link"}


class ClaimSubmitSerializer(serializers.Serializer):
    plan = serializers.ChoiceField(choices=sorted(PLAN_PRICE_CENTAVOS))
    reference_number = serializers.CharField(
        min_length=10, max_length=25, trim_whitespace=False
    )
    proof_link = serializers.URLField(max_length=500)

    def validate_reference_number(self, value):
        try:
            return normalize_gcash_reference(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(" ".join(exc.messages)) from exc

    def validate_proof_link(self, value):
        parsed = urlparse(value)
        if parsed.scheme != "https" or (parsed.hostname or "").lower() not in ALLOWED_HOSTS:
            raise serializers.ValidationError(
                "Use an https link from drive.google.com or docs.google.com."
            )
        return value

    def validate(self, attrs):
        extra = set(self.initial_data) - SUBMIT_FIELDS
        if extra:
            raise serializers.ValidationError(
                "Only plan, reference_number and proof_link can be submitted."
            )
        return attrs


def _claim_json(claim):
    return {
        "id": claim.pk,
        "plan": claim.plan,
        "reference_number": claim.reference_number,
        "proof_link": claim.proof_link,
        "amount_centavos": claim.amount_centavos,
        "method": claim.method,
        "status": claim.status,
        "created_at": claim.created_at.isoformat(),
    }


class MemberClaimView(APIView):
    """GET the caller's payments, POST a new GCash payment for staff review."""

    permission_classes = [TrialAllowedMemberAccess]

    def get(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            return Response({"items": []})
        claims = (
            PaymentClaim.objects.filter(member=profile)
            .order_by("-created_at", "-id")[:50]
        )
        return Response({"items": [_claim_json(claim) for claim in claims]})

    def post(self, request):
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            raise NotFound("No member profile.")
        serializer = ClaimSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = serializer.validated_data["plan"]
        reference = serializer.validated_data["reference_number"]
        if reference_in_use(reference):
            raise serializers.ValidationError(
                {"reference_number": "This GCash reference is already in use."}
            )

        try:
            with transaction.atomic():
                member = MemberProfile.objects.select_for_update().get(pk=profile.pk)
                pending = PaymentClaim.objects.filter(
                    member=member, status=PaymentClaim.Status.PENDING_REVIEW
                ).count()
                if pending >= MAX_PENDING_CLAIMS:
                    return Response(
                        {"detail": "You can have at most 3 payments under review."},
                        status=400,
                    )
                claim = PaymentClaim.objects.create(
                    member=member,
                    plan=plan,
                    amount_centavos=get_plan_price_centavos(plan),
                    reference_number=reference,
                    proof_link=serializer.validated_data["proof_link"],
                )
                amount = claim.amount_centavos
                transaction.on_commit(
                    lambda: notify(
                        request.user,
                        "GCash payment received — pending review",
                        kind=Notification.Kind.MEMBERSHIP,
                        body=(
                            f"Your {plan} GCash payment of ₱{amount / 100:,.2f} is waiting "
                            "for staff confirmation. Your membership activates only after "
                            "approval."
                        ),
                        link="member-home.html",
                    )
                )
        except IntegrityError:
            raise serializers.ValidationError(
                {"reference_number": "This GCash reference is already in use."}
            )
        return Response(_claim_json(claim), status=201)
