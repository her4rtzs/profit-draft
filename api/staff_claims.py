"""Owner/Cashier review of pending GCash claims.

Approval is one transaction: the claim is marked approved and the existing
membership service activates the member and sets the expiry. Nothing here logs
member names, references or proof links.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import PaymentClaim
from apps.finance.services import PLAN_PRICE_CENTAVOS, get_plan_prices_centavos
from apps.membership.models import MemberProfile
from apps.membership.services import PLAN_DAYS, enroll_member
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .permissions import CanReviewClaims


def _plan_for_amount(amount_centavos):
    for plan, price in get_plan_prices_centavos().items():
        if price == amount_centavos:
            return plan
    for plan, price in PLAN_PRICE_CENTAVOS.items():
        if price == amount_centavos:
            return plan
    raise ValidationError("This payment has no matching plan price.")


def _locked_claim(pk):
    claim = (
        PaymentClaim.objects.select_for_update()
        .select_related("member", "member__user")
        .filter(pk=pk)
        .first()
    )
    if claim is None:
        raise NotFound("Payment not found.")
    return claim


def _claim_row(claim):
    user = claim.member.user
    return {
        "id": claim.pk,
        "member_name": user.get_full_name() or user.username,
        "plan": claim.plan,
        "amount_centavos": claim.amount_centavos,
        "reference_number": claim.reference_number,
        "proof_link": claim.proof_link,
        "created_at": claim.created_at.isoformat(),
        "status": claim.status,
    }


class StaffClaimListView(APIView):
    """GET pending claims for review."""

    permission_classes = [CanReviewClaims]

    def get(self, request):
        claims = (
            PaymentClaim.objects.filter(status=PaymentClaim.Status.PENDING_REVIEW)
            .select_related("member", "member__user")
            .order_by("created_at", "id")
        )
        return Response({"items": [_claim_row(claim) for claim in claims]})


class ClaimApproveView(APIView):
    """POST approve a claim. Repeating it changes nothing."""

    permission_classes = [CanReviewClaims]

    def post(self, request, pk):
        with transaction.atomic():
            claim = _locked_claim(pk)
            if claim.status == PaymentClaim.Status.APPROVED:
                return Response({"status": "approved", "already_approved": True})
            if claim.status != PaymentClaim.Status.PENDING_REVIEW:
                raise ValidationError("Only a pending payment can be confirmed.")

            member = MemberProfile.objects.select_for_update().get(pk=claim.member_id)
            plan = (
                claim.plan
                if claim.plan in PLAN_PRICE_CENTAVOS
                else _plan_for_amount(claim.amount_centavos)
            )
            today = timezone.localdate()
            start = (
                member.expiry_date
                if member.expiry_date and member.expiry_date >= today
                else today
            )
            end = start + timedelta(days=PLAN_DAYS[plan])
            enroll_member(member, start, end, created_by=request.user)

            claim.status = PaymentClaim.Status.APPROVED
            claim.reviewed_by = request.user
            claim.reviewed_at = timezone.now()
            claim.save(update_fields=["status", "reviewed_by", "reviewed_at"])

            notify(
                member.user,
                "GCash payment approved",
                kind=Notification.Kind.MEMBERSHIP,
                body=(
                    f"Your {plan} membership is active until {end:%b %d, %Y}."
                ),
                link="member-home.html",
            )
            expiry = end
        return Response({"status": "approved", "expiry_date": expiry.isoformat()})


class ClaimRejectView(APIView):
    """POST reject a pending claim with a reason. Nothing is enrolled."""

    permission_classes = [CanReviewClaims]

    def post(self, request, pk):
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError("A reason is required to reject a payment.")
        if len(reason) > 500:
            raise ValidationError("The reason must be 500 characters or fewer.")

        with transaction.atomic():
            claim = _locked_claim(pk)
            if claim.status != PaymentClaim.Status.PENDING_REVIEW:
                raise ValidationError("Only a pending payment can be rejected.")
            claim.status = PaymentClaim.Status.REJECTED
            claim.reviewed_by = request.user
            claim.reviewed_at = timezone.now()
            claim.reject_reason = reason
            claim.save(
                update_fields=["status", "reviewed_by", "reviewed_at", "reject_reason"]
            )
        notify(
            claim.member.user,
            "GCash payment rejected",
            kind=Notification.Kind.MEMBERSHIP,
            body=f"Your GCash payment was not approved. Reason: {reason}",
            link="member-home.html",
        )
        return Response({"status": "rejected"})
