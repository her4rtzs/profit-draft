"""DRF read viewsets for the mobile member app.

Routing (api/urls.py) uses a DefaultRouter:
  - GET /api/membership/me/  -> the caller's own MemberProfile (404 if absent)
  - GET /api/attendance/     -> the caller's own attendance (200 [] if absent)

Access is closed by default (IsAuthenticated via REST_FRAMEWORK settings); the
attendance viewset additionally delegates to the shared RBAC policy through the
CanViewAttendance adapter so another member's data is unreadable.
"""

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.adapters import CanViewAttendance
from apps.membership.models import Attendance, MemberProfile

from .serializers import AttendanceSerializer, MemberProfileSerializer


class MemberProfileViewSet(viewsets.ReadOnlyModelViewSet):
    """Member profile reads. Only the ``me`` action is exposed to the client."""

    serializer_class = MemberProfileSerializer

    def get_queryset(self):
        # Scope strictly to the caller's own profile.
        return MemberProfile.objects.filter(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """GET /api/membership/me/ -> the caller's own profile as one object.

        Returns 404 {'detail': 'No member profile.'} when the authenticated user
        has no MemberProfile (e.g. a staff user). 404 (not 403) because there is
        simply no such resource for this user.
        """
        profile = MemberProfile.objects.filter(user=request.user).first()
        if profile is None:
            raise NotFound("No member profile.")
        serializer = self.get_serializer(profile)
        return Response(serializer.data)


class MyAttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/attendance/ -> the caller's own attendance records.

    List isolation is enforced by ``get_queryset`` (scoped to the caller's own
    profile), so a profile-less user correctly gets 200 []. The CanViewAttendance
    permission guards object-level reads via ``has_object_permission`` — passing
    the record's ``member`` to the pure policy — so one member can never read
    another member's record. CanViewAttendance is NOT applied as a blanket
    ``has_permission`` gate here because that pure helper (correctly) returns
    False for a Member with no target, which would wrongly block a member from
    listing their OWN records; the queryset is what scopes the list to self.
    """

    serializer_class = AttendanceSerializer
    permission_classes = [CanViewAttendance]

    def get_queryset(self):
        return Attendance.objects.filter(member__user=self.request.user)

    def get_permissions(self):
        # The collection read requires only authentication; the queryset scopes
        # it to the caller's own records. Object reads additionally enforce
        # CanViewAttendance so another member's record is unreadable.
        if self.action == "list":
            return [IsAuthenticated()]
        return super().get_permissions()
