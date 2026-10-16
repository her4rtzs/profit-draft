"""Announcement endpoints. Members read published notices. The owner manages all of them."""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.announcements import services
from apps.announcements.models import Announcement
from apps.membership.models import MemberProfile


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and getattr(request.user, "role", "") == "OWNER")


class MemberAnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ["id", "title", "message", "pinned", "publish_on", "published_at"]
        read_only_fields = fields


class StaffAnnouncementSerializer(serializers.ModelSerializer):
    member_ids = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id", "title", "message", "status", "audience", "publish_on", "pinned",
            "published_at", "archived_at", "created_at", "updated_at", "member_ids",
        ]
        read_only_fields = ["status", "published_at", "archived_at", "created_at", "updated_at", "member_ids"]

    def get_member_ids(self, obj):
        return list(MemberProfile.objects.filter(user__in=obj.recipients.all()).values_list("pk", flat=True))


class AnnouncementInputSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160)
    message = serializers.CharField(max_length=4000)
    audience = serializers.ChoiceField(choices=Announcement.Audience.values, default="ALL")
    publish_on = serializers.DateField(required=False, allow_null=True)
    pinned = serializers.BooleanField(default=False)
    member_ids = serializers.ListField(child=serializers.IntegerField(), required=False)


def _fail(exc):
    raise ValidationError({"detail": " ".join(exc.messages)})


class MemberAnnouncementListView(APIView):
    """GET /api/announcements/ -> published notices visible to the signed-in member."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = services.visible_to(request.user)
        return Response(MemberAnnouncementSerializer(rows, many=True).data)


class StaffAnnouncementListView(APIView):
    """GET /api/staff/announcements/?status=DRAFT|PUBLISHED|ARCHIVED  POST creates a draft."""

    permission_classes = [IsOwner]

    def get(self, request):
        rows = Announcement.objects.all().prefetch_related("recipients")
        status = request.query_params.get("status")
        if status:
            if status not in Announcement.Status.values:
                return Response({"detail": "Unknown status."}, status=400)
            rows = rows.filter(status=status)
        return Response(StaffAnnouncementSerializer(rows, many=True).data)

    def post(self, request):
        data = AnnouncementInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            note = services.create_draft(
                title=v["title"],
                message=v["message"],
                audience=v["audience"],
                publish_on=v.get("publish_on"),
                pinned=v["pinned"],
                member_ids=v.get("member_ids", []),
            )
        except DjangoValidationError as exc:
            _fail(exc)
        return Response(StaffAnnouncementSerializer(note).data, status=201)


class StaffAnnouncementDetailView(APIView):
    """GET one notice, or PATCH it. A published notice only accepts title, message and pin changes."""

    permission_classes = [IsOwner]

    def get(self, request, pk):
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        return Response(StaffAnnouncementSerializer(note).data)

    def patch(self, request, pk):
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        data = AnnouncementInputSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            services.update(
                note,
                title=v.get("title"),
                message=v.get("message"),
                audience=v.get("audience"),
                publish_on=v.get("publish_on"),
                pinned=v.get("pinned"),
                member_ids=v.get("member_ids"),
            )
        except DjangoValidationError as exc:
            _fail(exc)
        note.refresh_from_db()
        return Response(StaffAnnouncementSerializer(note).data)


class StaffAnnouncementPublishView(APIView):
    """POST /api/staff/announcements/<id>/publish/"""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        try:
            services.publish(note)
        except DjangoValidationError as exc:
            _fail(exc)
        note.refresh_from_db()
        return Response(StaffAnnouncementSerializer(note).data)


class StaffAnnouncementArchiveView(APIView):
    """POST /api/staff/announcements/<id>/archive/"""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        services.archive(note)
        note.refresh_from_db()
        return Response(StaffAnnouncementSerializer(note).data)
