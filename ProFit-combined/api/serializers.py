"""Read-only serializers for the mobile member app.

These expose membership data for reads only; writes are out of scope. No
business logic lives here — services/models own that.
"""

from rest_framework import serializers

from apps.membership.models import Attendance, MemberProfile


class MemberProfileSerializer(serializers.ModelSerializer):
    """Read-only view of a member's own profile."""

    class Meta:
        model = MemberProfile
        fields = ["id", "membership_status", "date_joined", "expiry_date"]
        read_only_fields = fields


class AttendanceSerializer(serializers.ModelSerializer):
    """Read-only view of a single attendance (check-in) record."""

    class Meta:
        model = Attendance
        fields = ["id", "check_in_at", "check_in_date"]
        read_only_fields = fields
