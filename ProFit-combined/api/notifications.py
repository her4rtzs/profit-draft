"""Notification endpoints for the signed-in user (staff and members alike)."""

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification
from apps.notifications.services import mark_all_read, mark_read, unread_count


class NotificationSerializer(serializers.ModelSerializer):
    time = serializers.DateTimeField(source="created_at", read_only=True)
    read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "time", "read"]
        read_only_fields = fields

    def get_read(self, obj):
        return obj.read_at is not None


class NotificationListView(APIView):
    """GET /api/notifications/?limit=30 -> {"unread": n, "items": [...]}"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            limit = min(max(int(request.query_params.get("limit", 20)), 1), 50)
        except ValueError:
            limit = 20
        rows = Notification.objects.filter(recipient=request.user)[:limit]
        return Response({
            "unread": unread_count(request.user),
            "items": NotificationSerializer(rows, many=True).data,
        })


class NotificationReadView(APIView):
    """POST /api/notifications/<id>/read/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            note = mark_read(request.user, pk)
        except LookupError:
            return Response({"detail": "Notification not found."}, status=404)
        return Response({"id": note.pk, "read": True, "unread": unread_count(request.user)})


class NotificationReadAllView(APIView):
    """POST /api/notifications/read-all/"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        mark_all_read(request.user)
        return Response({"unread": 0})
