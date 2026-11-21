"""Member GCash claims: submit only a reference number and a Drive link.

The server supplies the member, amount, method and status. The Drive link is
stored as text and never opened by this server.
"""

import re
from urllib.parse import urlparse

from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import PaymentClaim, Subscription
from apps.finance.services import PLAN_PRICE_CENTAVOS
from apps.membership.models import MemberProfile

from .permissions import MemberAccess

ALLOWED_HOSTS = {"drive.google.com", "docs.google.com"}
MAX_PENDING_CLAIMS = 3
SUBMIT_FIELDS = {"reference_number", "proof_link"}


class ClaimSubmitSerializer(serializers.Serializer):
    reference_number = serializers.CharField(
        min_length=10, max_length=20, trim_whitespace=False
    )
    proof_link = serializers.URLField(max_length=500)

    def validate_reference_number(self, value):
        if not re.fullmatch(r"[0-9 ]{10,20}", value):
            raise serializers.ValidationError(
                "Use 10 to 20 characters: digits and spaces only."
            )
        return value

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
                "Only reference_number and proof_link can be submitted."
            )
        return attrs


def _amount_centavos(profile):
    """Use the member's latest plan price; never a value from the request."""
    sub = Subscription.objects.filter(member=profile).order_by("-created_at", "-id").first()
    plan = ((sub.plan if sub else "") or "monthly").strip().lower()
    return PLAN_PRICE_CENTAVOS.get(plan, PLAN_PRICE_CENTAVOS["monthly"])


def _claim_json(claim):
    return {
        "id": claim.pk,
        "reference_number": claim.reference_number,
        "proof_link": claim.proof_link,
        "amount_centavos": claim.amount_centavos,
        "method": claim.method,
        "status": claim.status,
        "created_at": claim.created_at.isoformat(),
    }


class MemberClaimView(APIView):
    """GET the caller's claims, POST a new GCash claim."""

    permission_classes = [MemberAccess]

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

        with transaction.atomic():
            member = MemberProfile.objects.select_for_update().get(pk=profile.pk)
            pending = PaymentClaim.objects.filter(
                member=member, status=PaymentClaim.Status.PENDING_REVIEW
            ).count()
            if pending >= MAX_PENDING_CLAIMS:
                return Response(
                    {"detail": "You can have at most 3 claims under review."},
                    status=400,
                )
            claim = PaymentClaim.objects.create(
                member=member,
                amount_centavos=_amount_centavos(member),
                reference_number=serializer.validated_data["reference_number"],
                proof_link=serializer.validated_data["proof_link"],
            )
        return Response(_claim_json(claim), status=201)
