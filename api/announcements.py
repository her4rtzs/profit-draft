"""Announcement endpoints. Members and trainers read published notices. The owner manages all of them."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.announcements import services
from apps.announcements.models import Announcement
from apps.membership.models import MemberProfile


def _effective_staff_user(request):
    """Return the signed-in user, or in local DEBUG mode fall back to the local OWNER account
    so the local static dev server works seamlessly alongside demo-session auth."""
    if request.user and request.user.is_authenticated:
        return request.user
    if getattr(settings, "DEBUG", False):
        host = request.get_host().split(":")[0].lower()
        if host in ("localhost", "127.0.0.1"):
            User = get_user_model()
            return User.objects.filter(role="OWNER", is_active=True).first()
    return request.user


class IsOwner(BasePermission):
    """Allow only the gym owner (or administrator) to manage announcements."""
    def has_permission(self, request, view):
        user = _effective_staff_user(request)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        role = str(getattr(user, "role", "")).upper()
        return bool(
            role in ("OWNER", "ADMIN")
            or getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
        )


IsStaffOrOwner = IsOwner

_schema_ready = False

def _ensure_announcements_schema():
    global _schema_ready
    if _schema_ready:
        return
    import logging
    logger = logging.getLogger(__name__)
    try:
        from django.db import connection
        engine = connection.settings_dict.get("ENGINE", "")
        if "sqlite" in engine:
            try:
                from django.core.management import call_command
                call_command("migrate", "announcements", interactive=False)
            except Exception:
                pass
            _schema_ready = True
            return

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'announcements_announcement'
            """)
            table_row = cursor.fetchone()
            if table_row:
                cursor.execute("""
                    ALTER TABLE announcements_announcement 
                    ADD COLUMN IF NOT EXISTS event_date date NULL;
                """)
            else:
                from django.core.management import call_command
                call_command("migrate", "announcements", interactive=False)
        _schema_ready = True
    except Exception as exc:
        logger.warning("Could not automatically verify announcements schema: %s", exc)
        try:
            from django.core.management import call_command
            call_command("migrate", "announcements", interactive=False)
            _schema_ready = True
        except Exception:
            pass


def _public_audience(raw):
    val = str(raw or "").strip().lower()
    if val in ("all", "everyone", ""):
        return "everyone"
    if val in ("members", "trainers", "selected"):
        return val
    return val


class MemberAnnouncementSerializer(serializers.ModelSerializer):
    body = serializers.CharField(source="message", read_only=True)
    audience = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "body",
            "message",
            "audience",
            "event_date",
            "pinned",
            "publish_on",
            "published_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_audience(self, obj):
        return _public_audience(obj.audience)


class StaffAnnouncementSerializer(serializers.ModelSerializer):
    body = serializers.CharField(source="message", read_only=True)
    status = serializers.SerializerMethodField()
    audience = serializers.SerializerMethodField()
    member_ids = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "body",
            "message",
            "status",
            "audience",
            "event_date",
            "publish_on",
            "pinned",
            "published_at",
            "archived_at",
            "created_at",
            "updated_at",
            "member_ids",
        ]
        read_only_fields = fields

    def get_status(self, obj):
        return str(obj.status or "DRAFT").lower()

    def get_audience(self, obj):
        return _public_audience(obj.audience)

    def get_member_ids(self, obj):
        return list(
            MemberProfile.objects.filter(user__in=obj.recipients.all()).values_list("pk", flat=True)
        )


def _validate_announcement_payload(raw_data, *, partial=False):
    errors = {}
    cleaned = {}

    if not partial or "title" in raw_data:
        raw_title = raw_data.get("title")
        title = str(raw_title).strip() if raw_title is not None else ""
        if not title:
            errors["title"] = ["Please add a title."]
        elif len(title) > services.MAX_TITLE_LENGTH:
            errors["title"] = [f"Title must be {services.MAX_TITLE_LENGTH} characters or fewer."]
        else:
            cleaned["title"] = title

    has_body = "body" in raw_data or "message" in raw_data
    if not partial or has_body:
        raw_body = raw_data.get("body") if "body" in raw_data else raw_data.get("message", "")
        body = "" if raw_body is None else str(raw_body)
        if len(body) > services.MAX_BODY_LENGTH:
            msg = f"Body must be {services.MAX_BODY_LENGTH} characters or fewer."
            errors["body"] = [msg]
            errors["message"] = [msg]
        else:
            cleaned["message"] = body

    if not partial or "audience" in raw_data:
        raw_aud = raw_data.get("audience", "everyone")
        try:
            cleaned["audience"] = services.normalize_audience(raw_aud)
        except DjangoValidationError as exc:
            errors["audience"] = list(exc.messages)

    if "event_date" in raw_data:
        cleaned["has_event_date"] = True
        raw_ed = raw_data.get("event_date")
        if raw_ed in (None, ""):
            cleaned["event_date"] = None
        else:
            f = serializers.DateField()
            try:
                cleaned["event_date"] = f.to_internal_value(raw_ed)
            except serializers.ValidationError:
                errors["event_date"] = ["Enter a valid date (YYYY-MM-DD)."]

    if "publish_on" in raw_data:
        raw_po = raw_data.get("publish_on")
        if raw_po in (None, ""):
            cleaned["publish_on"] = None
        else:
            f = serializers.DateField()
            try:
                cleaned["publish_on"] = f.to_internal_value(raw_po)
            except serializers.ValidationError:
                errors["publish_on"] = ["Enter a valid date (YYYY-MM-DD)."]

    if "pinned" in raw_data:
        cleaned["pinned"] = bool(raw_data.get("pinned"))
    elif not partial:
        cleaned["pinned"] = False

    if "member_ids" in raw_data:
        raw_ids = raw_data.get("member_ids")
        if not isinstance(raw_ids, list):
            errors["member_ids"] = ["Expected a list of member IDs."]
        else:
            try:
                cleaned["member_ids"] = [int(x) for x in raw_ids]
            except (TypeError, ValueError):
                errors["member_ids"] = ["Member IDs must be integers."]

    if "status" in raw_data:
        raw_st = raw_data.get("status")
        if raw_st not in (None, ""):
            try:
                cleaned["status"] = services.normalize_status(raw_st)
            except DjangoValidationError as exc:
                errors["status"] = list(exc.messages)
    elif not partial:
        cleaned["status"] = Announcement.Status.DRAFT

    if errors:
        raise ValidationError(errors)
    return cleaned


def _fail(exc):
    raise ValidationError({"detail": " ".join(exc.messages)})


def _item_with_meta(note):
    try:
        payload = dict(StaffAnnouncementSerializer(note).data)
    except Exception as exc:
        if "event_date" in str(exc).lower():
            note_def = Announcement.objects.defer("event_date").get(pk=note.pk)
            payload = dict(StaffAnnouncementSerializer(note_def).data)
        else:
            raise
    stats, counts = services.get_staff_stats_and_counts()
    payload["stats"] = stats
    payload["counts"] = counts
    return payload


class MemberAnnouncementListView(APIView):
    """GET /api/announcements/ -> published notices visible to the signed-in member or trainer."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = services.visible_to(request.user)
        try:
            return Response(MemberAnnouncementSerializer(rows, many=True).data)
        except Exception as exc:
            if "event_date" in str(exc).lower():
                return Response(MemberAnnouncementSerializer(rows.defer("event_date"), many=True).data)
            raise


class StaffAnnouncementListView(APIView):
    """GET /api/staff/announcements/?status=all|draft|published|archived&q=<search>
    POST /api/staff/announcements/ creates a draft or publishes immediately.
    """

    permission_classes = [IsOwner]

    def get(self, request):
        import logging
        logger = logging.getLogger(__name__)
        _ensure_announcements_schema()
        try:
            rows = Announcement.objects.all().prefetch_related("recipients")
            raw_status = (request.query_params.get("status") or "").strip().lower()
            if raw_status in ("draft", "drafts"):
                rows = rows.filter(status=Announcement.Status.DRAFT)
            elif raw_status == "published":
                rows = rows.filter(status=Announcement.Status.PUBLISHED)
            elif raw_status == "archived":
                rows = rows.filter(status=Announcement.Status.ARCHIVED)

            q = (request.query_params.get("q") or "").strip()
            if q:
                rows = rows.filter(
                    Q(title__icontains=q) | Q(message__icontains=q) | Q(audience__icontains=q)
                )

            rows = rows.order_by("-pinned", "-created_at", "-id")

            try:
                items = StaffAnnouncementSerializer(rows, many=True).data
            except Exception as ser_err:
                err_text = str(ser_err).lower()
                if "event_date" in err_text:
                    logger.warning("Database missing event_date column. Running with defer('event_date').")
                    rows_deferred = rows.defer("event_date")
                    items = StaffAnnouncementSerializer(rows_deferred, many=True).data
                else:
                    raise

            stats, counts = services.get_staff_stats_and_counts()
            return Response(
                {
                    "items": items,
                    "results": items,
                    "stats": stats,
                    "counts": counts,
                }
            )
        except Exception as exc:
            err_msg = str(exc).lower()
            if "no such table" in err_msg or ("does not exist" in err_msg and "announcements_announcement" in err_msg):
                logger.error("Table announcements_announcement missing in database. Migrations pending: %s", exc)
                empty_stats = {
                    "total": 0,
                    "published_this_month": 0,
                    "drafts": 0,
                    "live_now": 0,
                    "people_count": 0,
                }
                empty_counts = {"all": 0, "draft": 0, "published": 0, "archived": 0}
                return Response(
                    {
                        "items": [],
                        "results": [],
                        "stats": empty_stats,
                        "counts": empty_counts,
                        "migration_required": True,
                    }
                )

            user = _effective_staff_user(request)
            user_info = f"user_id={getattr(user, 'pk', None)} role={getattr(user, 'role', None)}"
            logger.exception("Failed to retrieve announcements (%s, %s): %s", type(exc).__name__, user_info, exc)
            return Response(
                {"detail": "Could not retrieve announcements. Please retry."},
                status=500,
            )

    def post(self, request):
        import logging
        logger = logging.getLogger(__name__)
        _ensure_announcements_schema()

        try:
            v = _validate_announcement_payload(request.data, partial=False)
        except ValidationError as val_err:
            return Response(val_err.detail, status=400)
        except Exception as val_exc:
            return Response({"detail": str(val_exc)}, status=400)

        try:
            note = services.create_announcement(
                title=v["title"],
                message=v.get("message", ""),
                audience=v.get("audience", Announcement.Audience.EVERYONE),
                event_date=v.get("event_date"),
                publish_on=v.get("publish_on"),
                pinned=v.get("pinned", False),
                member_ids=v.get("member_ids", []),
                status=v.get("status", Announcement.Status.DRAFT),
                created_by=_effective_staff_user(request),
            )
        except DjangoValidationError as exc:
            _fail(exc)
        except Exception as exc:
            logger.exception("Failed to create announcement: %s", exc)
            return Response({"detail": f"Could not create announcement: {str(exc)}"}, status=400)

        try:
            note.refresh_from_db()
        except Exception:
            pass

        try:
            return Response(_item_with_meta(note), status=201)
        except Exception as meta_exc:
            logger.exception("Failed serializing created announcement metadata: %s", meta_exc)
            return Response(StaffAnnouncementSerializer(note).data, status=201)


class StaffAnnouncementDetailView(APIView):
    """GET, PATCH, or DELETE /api/staff/announcements/<id>/."""

    permission_classes = [IsOwner]

    def get(self, request, pk):
        _ensure_announcements_schema()
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        try:
            return Response(_item_with_meta(note))
        except Exception:
            return Response(StaffAnnouncementSerializer(note).data)

    def patch(self, request, pk):
        import logging
        logger = logging.getLogger(__name__)
        _ensure_announcements_schema()
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)

        try:
            v = _validate_announcement_payload(request.data, partial=True)
        except ValidationError as val_err:
            return Response(val_err.detail, status=400)
        except Exception as val_exc:
            return Response({"detail": str(val_exc)}, status=400)

        try:
            services.update(
                note,
                title=v.get("title"),
                message=v.get("message"),
                audience=v.get("audience"),
                event_date=v.get("event_date"),
                has_event_date=v.get("has_event_date", False),
                publish_on=v.get("publish_on"),
                pinned=v.get("pinned"),
                member_ids=v.get("member_ids"),
                status=v.get("status"),
            )
        except DjangoValidationError as exc:
            _fail(exc)
        except Exception as exc:
            logger.exception("Failed to update announcement %s: %s", pk, exc)
            return Response({"detail": f"Could not update announcement: {str(exc)}"}, status=400)

        try:
            note.refresh_from_db()
        except Exception:
            pass

        try:
            return Response(_item_with_meta(note))
        except Exception as meta_exc:
            logger.exception("Failed serializing updated announcement metadata: %s", meta_exc)
            return Response(StaffAnnouncementSerializer(note).data)

    def delete(self, request, pk):
        _ensure_announcements_schema()
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        services.delete_announcement(note)
        stats, counts = services.get_staff_stats_and_counts()
        return Response({"deleted": pk, "stats": stats, "counts": counts})


class StaffAnnouncementPublishView(APIView):
    """POST /api/staff/announcements/<id>/publish/"""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        import logging
        logger = logging.getLogger(__name__)
        _ensure_announcements_schema()
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        try:
            services.publish(note)
        except DjangoValidationError as exc:
            _fail(exc)
        except Exception as exc:
            logger.exception("Failed to publish announcement %s: %s", pk, exc)
            return Response({"detail": f"Could not publish announcement: {str(exc)}"}, status=400)

        try:
            note.refresh_from_db()
        except Exception:
            pass

        try:
            return Response(_item_with_meta(note))
        except Exception as meta_exc:
            logger.exception("Failed serializing published announcement metadata: %s", meta_exc)
            return Response(StaffAnnouncementSerializer(note).data)


class StaffAnnouncementArchiveView(APIView):
    """POST /api/staff/announcements/<id>/archive/"""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        import logging
        logger = logging.getLogger(__name__)
        _ensure_announcements_schema()
        note = Announcement.objects.filter(pk=pk).first()
        if note is None:
            return Response({"detail": "Announcement not found."}, status=404)
        try:
            services.archive(note)
        except Exception as exc:
            logger.exception("Failed to archive announcement %s: %s", pk, exc)
            return Response({"detail": f"Could not archive announcement: {str(exc)}"}, status=400)

        try:
            note.refresh_from_db()
        except Exception:
            pass

        try:
            return Response(_item_with_meta(note))
        except Exception:
            return Response(StaffAnnouncementSerializer(note).data)
