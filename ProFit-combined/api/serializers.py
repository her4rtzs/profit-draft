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


# --- Phase 1: staff member management and check-in --------------------------

PLAN_CHOICES = ["monthly", "quarterly", "annual"]


class StaffMemberSerializer(serializers.ModelSerializer):
    """Staff view of a member: identity, contact, and membership state."""

    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = MemberProfile
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "address",
            "membership_status",
            "date_joined",
            "expiry_date",
        ]
        read_only_fields = ["membership_status", "date_joined", "expiry_date"]

    def get_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


class StaffMemberCreateSerializer(serializers.Serializer):
    """Input for creating a member. ``plan`` is optional; without it the member
    is created as PENDING until a renewal is recorded."""

    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True)
    plan = serializers.ChoiceField(choices=PLAN_CHOICES, required=False)
    start_date = serializers.DateField(required=False)


class StaffMemberUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True)


class RenewSerializer(serializers.Serializer):
    plan = serializers.ChoiceField(choices=PLAN_CHOICES)
    start_date = serializers.DateField(required=False)


class CheckInSerializer(serializers.Serializer):
    member_id = serializers.IntegerField()


class StaffAttendanceSerializer(serializers.ModelSerializer):
    """One check-in row for the front-desk list."""

    member_id = serializers.IntegerField(source="member.id", read_only=True)
    name = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = ["id", "member_id", "name", "check_in_at", "check_in_date"]
        read_only_fields = fields

    def get_name(self, obj):
        user = obj.member.user
        return user.get_full_name() or user.username
