"""Notification endpoints for the signed-in user (staff and members alike)."""

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification
from apps.notifications.services import (
    clear_notifications,
    delete_notification,
    mark_all_read,
    mark_read,
    unread_count,
)

from .permissions import MemberAccess


class NotificationSerializer(serializers.ModelSerializer):
    time = serializers.DateTimeField(source="created_at", read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    read_at = serializers.DateTimeField(read_only=True)
    read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "time", "created_at", "read", "read_at"]
        read_only_fields = fields

    def get_read(self, obj):
        return obj.read_at is not None


def build_notification_payload(user, *, limit=30, kind="", unread_only=False):
    all_qs = Notification.objects.filter(recipient=user)
    all_rows = list(all_qs)
    unread_total = sum(1 for n in all_rows if n.read_at is None)
    trainer_count = sum(1 for n in all_rows if n.kind == Notification.Kind.TRAINER)
    ann_count = sum(1 for n in all_rows if n.kind == Notification.Kind.ANNOUNCEMENT)
    membership_count = sum(1 for n in all_rows if n.kind == Notification.Kind.MEMBERSHIP)
    payment_count = sum(1 for n in all_rows if n.kind == Notification.Kind.PAYMENT)
    general_count = sum(1 for n in all_rows if n.kind == Notification.Kind.GENERAL)

    filtered = all_qs
    if kind:
        filtered = filtered.filter(kind__iexact=kind)
    if unread_only:
        filtered = filtered.filter(read_at__isnull=True)
    rows = filtered[:limit]

    return {
        "unread": unread_total,
        "total": len(all_rows),
        "stats": {
            "total": len(all_rows),
            "unread": unread_total,
            "trainer": trainer_count,
            "announcement": ann_count,
            "membership": membership_count,
            "payment": payment_count,
            "general": general_count,
        },
        "items": NotificationSerializer(rows, many=True).data,
    }


class NotificationListView(APIView):
    """GET /api/notifications/?limit=30 -> {"unread": n, "total": t, "stats": {...}, "items": [...]}"""

    permission_classes = [IsAuthenticated, MemberAccess]

    def get(self, request):
        try:
            limit = min(max(int(request.query_params.get("limit", 30)), 1), 100)
        except ValueError:
            limit = 30
        kind = str(request.query_params.get("kind") or "").strip()
        unread_only = str(request.query_params.get("unread") or "").strip().lower() in ("1", "true", "yes")
        return Response(
            build_notification_payload(
                request.user,
                limit=limit,
                kind=kind,
                unread_only=unread_only,
            )
        )


class NotificationReadView(APIView):
    """POST /api/notifications/<id>/read/"""

    permission_classes = [IsAuthenticated, MemberAccess]

    def post(self, request, pk):
        try:
            note = mark_read(request.user, pk)
        except LookupError:
            return Response({"detail": "Notification not found."}, status=404)
        return Response({
            "id": note.pk,
            "read": True,
            "read_at": note.read_at.isoformat() if note.read_at else None,
            "unread": unread_count(request.user),
        })


class NotificationReadAllView(APIView):
    """POST /api/notifications/read-all/"""

    permission_classes = [IsAuthenticated, MemberAccess]

    def post(self, request):
        mark_all_read(request.user)
        return Response({"unread": 0})


class NotificationDeleteView(APIView):
    """DELETE /api/notifications/<id>/"""

    permission_classes = [IsAuthenticated, MemberAccess]

    def delete(self, request, pk):
        try:
            delete_notification(request.user, pk)
        except LookupError:
            return Response({"detail": "Notification not found."}, status=404)
        return Response({"deleted": pk, "unread": unread_count(request.user)})


class NotificationClearView(APIView):
    """POST /api/notifications/clear/"""

    permission_classes = [IsAuthenticated, MemberAccess]

    def post(self, request):
        read_only = bool(request.data.get("read_only", False))
        cleared = clear_notifications(request.user, read_only=read_only)
        return Response({"cleared": cleared, "unread": unread_count(request.user)})

