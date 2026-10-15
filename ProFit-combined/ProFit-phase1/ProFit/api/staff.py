"""Staff endpoints for Phase 1: member management and front-desk check-in.

Mounted at /api/staff/. Who may call what comes from the shared RBAC policy in
apps/accounts/permissions.py, through the DRF adapters. This module adds no
capabilities. Business rules live in apps/membership/services.py.
"""

from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.adapters import CanManageEnrollment, CanViewAttendance
from apps.membership.models import Attendance, MemberProfile
from apps.membership.services import (
    check_in_member,
    create_member,
    renew_member,
    update_member_profile,
)

from .serializers import (
    CheckInSerializer,
    RenewSerializer,
    StaffAttendanceSerializer,
    StaffMemberCreateSerializer,
    StaffMemberSerializer,
    StaffMemberUpdateSerializer,
)


def _bad_request(exc):
    """Map a service-level rule failure to a 400 with a readable ``detail``."""
    return Response(
        {"detail": " ".join(exc.messages)},
        status=status.HTTP_400_BAD_REQUEST,
    )


class StaffMemberViewSet(viewsets.ModelViewSet):
    """Owner and Cashier manage members. Trainers may read a member's detail."""

    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action == "retrieve":
            return [CanViewAttendance()]
        return [CanManageEnrollment()]

    def get_serializer_class(self):
        if self.action == "create":
            return StaffMemberCreateSerializer
        if self.action in ("update", "partial_update"):
            return StaffMemberUpdateSerializer
        return StaffMemberSerializer

    def get_queryset(self):
        queryset = MemberProfile.objects.select_related("user").order_by("user__username")
        query = (self.request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(user__username__icontains=query)
                | Q(user__first_name__icontains=query)
                | Q(user__last_name__icontains=query)
                | Q(phone__icontains=query)
            )
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = StaffMemberCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            with transaction.atomic():
                profile = create_member(
                    name=data["name"],
                    email=data["email"],
                    password=data["password"],
                    phone=data.get("phone", ""),
                    address=data.get("address", ""),
                )
                if data.get("plan"):
                    renew_member(
                        profile,
                        data["plan"],
                        created_by=request.user,
                        start_date=data.get("start_date"),
                    )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        profile.refresh_from_db()
        return Response(StaffMemberSerializer(profile).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        profile = self.get_object()
        serializer = StaffMemberUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        update_member_profile(
            profile,
            name=data.get("name"),
            phone=data.get("phone"),
            address=data.get("address"),
        )
        return Response(StaffMemberSerializer(profile).data)

    @action(detail=True, methods=["post"], url_path="renew")
    def renew(self, request, pk=None):
        profile = self.get_object()
        serializer = RenewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            renew_member(
                profile,
                data["plan"],
                created_by=request.user,
                start_date=data.get("start_date"),
            )
        except DjangoValidationError as exc:
            return _bad_request(exc)
        profile.refresh_from_db()
        return Response(StaffMemberSerializer(profile).data)


class StaffCheckInView(APIView):
    """POST /api/staff/attendance/check-in/ with {"member_id": n}."""

    permission_classes = [CanViewAttendance]

    def post(self, request):
        serializer = CheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = (
            MemberProfile.objects.select_related("user")
            .filter(pk=serializer.validated_data["member_id"])
            .first()
        )
        if profile is None:
            return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            record = check_in_member(profile, recorded_by=request.user)
        except DjangoValidationError as exc:
            return _bad_request(exc)
        return Response(StaffAttendanceSerializer(record).data)


class StaffAttendanceView(APIView):
    """GET /api/staff/attendance/?date=YYYY-MM-DD (defaults to today)."""

    permission_classes = [CanViewAttendance]

    def get(self, request):
        raw = request.query_params.get("date")
        try:
            day = date.fromisoformat(raw) if raw else timezone.localdate()
        except ValueError:
            return Response(
                {"detail": "date must be YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rows = (
            Attendance.objects.select_related("member__user")
            .filter(check_in_date=day)
            .order_by("check_in_at")
        )
        return Response(StaffAttendanceSerializer(rows, many=True).data)
