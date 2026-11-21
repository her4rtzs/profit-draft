"""Owner-only cashier management endpoints.

Reuses the staff invitation flow (``create_staff_invite`` + ``send_invite_email``)
with ``role=Role.CASHIER``. Users are never deleted, only deactivated
(``is_active = False``).
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.emails import send_invite_email
from apps.accounts.models import Role, StaffInvite
from apps.accounts.services import create_staff_invite
from apps.accounts.validators import validate_real_email
from apps.membership.services import validate_full_name


class IsActiveOwner(BasePermission):
    """Allow only signed-in, active Owner accounts."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "role", "") == Role.OWNER
        )


def _try_send_cashier_invite(request, invite, raw_token):
    accept_url = request.build_absolute_uri(
        reverse("accounts:accept_invite", kwargs={"invite_id": invite.pk, "token": raw_token})
    )
    backend = getattr(settings, "EMAIL_BACKEND", "")
    is_non_delivery = any(b in backend for b in ("console.", "locmem.", "dummy."))
    if is_non_delivery:
        return (
            accept_url,
            False,
            "Email delivery is not configured on this server. Copy and share the invitation link below.",
        )
    try:
        send_invite_email(invite, raw_token, accept_url)
        return accept_url, True, "Invitation email sent to the cashier."
    except Exception:
        return accept_url, False, "Email delivery failed. Copy and share the invitation link below."


def _pending_invite_emails():
    now = timezone.now()
    return {
        email.lower()
        for email in StaffInvite.objects.filter(
            role=Role.CASHIER,
            used_at__isnull=True,
            expires_at__gt=now,
        ).values_list("email", flat=True)
    }


def _cashier_json(user, pending_emails):
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    full_name = f"{first} {last}".strip()
    email = (user.email or "").strip()
    if user.is_active:
        status_label = "Active"
        status_key = "active"
    elif email.lower() in pending_emails:
        status_label = "Invite pending"
        status_key = "pending"
    else:
        status_label = "Deactivated"
        status_key = "deactivated"
    return {
        "id": user.pk,
        "name": full_name,
        "email": email,
        "status": status_label,
        "status_key": status_key,
        "is_active": bool(user.is_active),
    }


class StaffCashierListView(APIView):
    """GET cashiers + counts; POST invites a new cashier (Owner only)."""

    permission_classes = [IsActiveOwner]

    def get(self, request):
        User = get_user_model()
        pending_emails = _pending_invite_emails()
        users = User.objects.filter(role=Role.CASHIER).order_by(
            "-is_active", "first_name", "last_name", "email"
        )
        rows = [_cashier_json(u, pending_emails) for u in users]
        active_count = sum(1 for r in rows if r["status_key"] == "active")
        pending_count = sum(1 for r in rows if r["status_key"] == "pending")
        return Response(
            {
                "active_count": active_count,
                "pending_invites_count": pending_count,
                "cashiers": rows,
            }
        )

    def post(self, request):
        User = get_user_model()
        data = request.data if isinstance(request.data, dict) else {}

        try:
            first_name, last_name = validate_full_name(data.get("full_name") or data.get("name"))
        except DjangoValidationError as exc:
            return Response({"detail": exc.messages[0]}, status=status.HTTP_400_BAD_REQUEST)

        raw_email = (data.get("email") or "").strip()
        if not raw_email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            email = validate_real_email(raw_email)
        except DjangoValidationError as exc:
            return Response({"detail": exc.messages[0]}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).exists():
            return Response(
                {"detail": "An account with this email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            user = User(
                username=email,
                email=email,
                first_name=first_name[:150],
                last_name=last_name[:150],
                role=Role.CASHIER,
                is_active=False,
            )
            user.set_unusable_password()
            user.save()
            invite, raw_token = create_staff_invite(
                owner=request.user,
                email=email,
                role=Role.CASHIER,
            )

        invite_url, email_sent, email_note = _try_send_cashier_invite(request, invite, raw_token)
        payload = _cashier_json(user, {email.lower()})
        payload.update(
            {
                "invite_url": invite_url,
                "email_sent": email_sent,
                "email_status_note": email_note,
            }
        )
        return Response(payload, status=status.HTTP_201_CREATED)


class StaffCashierResendInviteView(APIView):
    """POST /api/staff/cashiers/<pk>/resend-invite/ — Owner only."""

    permission_classes = [IsActiveOwner]

    def post(self, request, pk):
        User = get_user_model()
        user = User.objects.filter(pk=pk, role=Role.CASHIER).first()
        if user is None:
            return Response({"detail": "Cashier not found."}, status=status.HTTP_404_NOT_FOUND)
        if user.is_active:
            return Response(
                {"detail": "This cashier account is already active."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.email:
            return Response(
                {"detail": "This cashier account does not have an email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invite, raw_token = create_staff_invite(
            owner=request.user,
            email=user.email,
            role=Role.CASHIER,
        )
        invite_url, email_sent, email_note = _try_send_cashier_invite(request, invite, raw_token)
        payload = _cashier_json(user, {user.email.lower()})
        payload.update(
            {
                "invite_url": invite_url,
                "email_sent": email_sent,
                "email_status_note": email_note,
            }
        )
        return Response(payload, status=status.HTTP_200_OK)


class StaffCashierDeactivateView(APIView):
    """POST /api/staff/cashiers/<pk>/deactivate/ — Owner only. Never deletes the user."""

    permission_classes = [IsActiveOwner]

    def post(self, request, pk):
        User = get_user_model()
        user = User.objects.filter(pk=pk, role=Role.CASHIER).first()
        if user is None:
            return Response({"detail": "Cashier not found."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            if user.is_active:
                user.is_active = False
                user.save(update_fields=["is_active"])
            if user.email:
                StaffInvite.objects.filter(
                    email__iexact=user.email,
                    role=Role.CASHIER,
                    used_at__isnull=True,
                ).update(used_at=timezone.now())

        return Response(_cashier_json(user, set()), status=status.HTTP_200_OK)
