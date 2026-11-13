"""Announcement rules. Views call these; the rules live here, not in the views."""

import datetime
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.membership.models import MemberProfile
from apps.notifications.models import Notification
from apps.notifications.services import notify_many

from .models import Announcement

MAX_PINNED = 3
MAX_TITLE_LENGTH = 80
MAX_BODY_LENGTH = 600

DRAFT, PUBLISHED, ARCHIVED = (
    Announcement.Status.DRAFT,
    Announcement.Status.PUBLISHED,
    Announcement.Status.ARCHIVED,
)
EVERYONE, MEMBERS, TRAINERS, ALL, SELECTED = (
    Announcement.Audience.EVERYONE,
    Announcement.Audience.MEMBERS,
    Announcement.Audience.TRAINERS,
    Announcement.Audience.ALL,
    Announcement.Audience.SELECTED,
)


def normalize_audience(value):
    if value is None:
        return EVERYONE
    raw = str(value).strip()
    low = raw.lower()
    if low in ("everyone", "all"):
        return ALL if raw == "ALL" else EVERYONE
    if low == "members":
        return MEMBERS
    if low == "trainers":
        return TRAINERS
    if low == "selected":
        return SELECTED
    raise ValidationError("Choose a valid audience.")


def normalize_status(value):
    if value is None:
        return None
    low = str(value).strip().lower()
    if low in ("draft", "drafts"):
        return DRAFT
    if low == "published":
        return PUBLISHED
    if low == "archived":
        return ARCHIVED
    raise ValidationError("Choose a valid status.")


def visible_to(user):
    """Published announcements that this member or trainer can see today.

    Draft and archived items are never returned to member or trainer portals.
    """
    if not user or not user.is_authenticated:
        return Announcement.objects.none()
    role = getattr(user, "role", None)
    today = timezone.localdate()
    base = Announcement.objects.filter(status=PUBLISHED).filter(
        Q(publish_on__isnull=True) | Q(publish_on__lte=today)
    )
    if role in ("MEMBER", "OWNER", "CASHIER"):
        return (
            base.filter(
                Q(audience__in=[ALL, EVERYONE, MEMBERS, "EVERYONE", "MEMBERS"])
                | Q(audience=SELECTED, recipients=user)
            )
            .distinct()
        )
    if role == "TRAINER":
        return base.filter(
            audience__in=[ALL, EVERYONE, TRAINERS, "EVERYONE", "TRAINERS"]
        ).distinct()
    return Announcement.objects.none()


def _resolve_user_ids(member_ids):
    """Turn MemberProfile ids into user ids. Unknown ids are an error, not silently dropped."""
    ids = list(dict.fromkeys(member_ids or []))
    if not ids:
        return []
    found = list(MemberProfile.objects.filter(pk__in=ids).values_list("user_id", flat=True))
    if len(found) != len(ids):
        raise ValidationError("Some selected members were not found.")
    return found


def _check_pin_room(announcement):
    if not announcement.pinned:
        return
    others = (
        Announcement.objects.filter(status=PUBLISHED, pinned=True)
        .exclude(pk=announcement.pk)
        .count()
    )
    if others >= MAX_PINNED:
        raise ValidationError(f"Only {MAX_PINNED} pinned announcements are allowed. Unpin one first.")


def create_draft(
    *,
    title,
    message="",
    audience=EVERYONE,
    event_date=None,
    publish_on=None,
    pinned=False,
    member_ids=(),
    created_by=None,
):
    aud = normalize_audience(audience)
    user_ids = _resolve_user_ids(member_ids) if aud == SELECTED else []
    with transaction.atomic():
        note = Announcement.objects.create(
            title=title[:MAX_TITLE_LENGTH],
            message=(message or "")[:MAX_BODY_LENGTH],
            audience=aud,
            event_date=event_date,
            publish_on=publish_on,
            pinned=pinned,
            created_by=created_by if getattr(created_by, "is_authenticated", False) else None,
        )
        if user_ids:
            note.recipients.set(user_ids)
    return note


def create_announcement(
    *,
    title,
    message="",
    audience=EVERYONE,
    event_date=None,
    publish_on=None,
    pinned=False,
    member_ids=(),
    status=DRAFT,
    created_by=None,
):
    target_status = normalize_status(status) or DRAFT
    with transaction.atomic():
        note = create_draft(
            title=title,
            message=message,
            audience=audience,
            event_date=event_date,
            publish_on=publish_on,
            pinned=pinned,
            member_ids=member_ids,
            created_by=created_by,
        )
        if target_status == PUBLISHED:
            publish(note)
        elif target_status == ARCHIVED:
            archive(note)
    return note


def update(
    note,
    *,
    title=None,
    message=None,
    audience=None,
    event_date=None,
    has_event_date=False,
    publish_on=None,
    pinned=None,
    member_ids=None,
    status=None,
):
    """Edit an announcement and optionally transition its status."""
    target_status = normalize_status(status) if status is not None else None
    aud = normalize_audience(audience) if audience is not None else None

    if note.status == ARCHIVED and target_status is None:
        raise ValidationError("Archived announcements are read-only.")
    if note.status == PUBLISHED and (
        (aud == SELECTED and note.audience != SELECTED)
        or member_ids is not None
        or (publish_on is not None and publish_on != note.publish_on)
    ):
        raise ValidationError("A published announcement's audience and date cannot change.")

    with transaction.atomic():
        if title is not None:
            note.title = title[:MAX_TITLE_LENGTH]
        if message is not None:
            note.message = message[:MAX_BODY_LENGTH]
        if has_event_date or event_date is not None:
            note.event_date = event_date
        if pinned is not None:
            note.pinned = pinned
            _check_pin_room(note)
        if aud is not None and not (note.status == PUBLISHED and aud == SELECTED):
            note.audience = aud
        if note.status == DRAFT:
            if publish_on is not None:
                note.publish_on = publish_on
            if aud is not None or member_ids is not None:
                effective = note.audience
                if effective == SELECTED:
                    note.recipients.set(_resolve_user_ids(member_ids or []))
                else:
                    note.recipients.clear()

        if target_status == DRAFT and note.status != DRAFT:
            note.status = DRAFT
            note.archived_at = None
        note.save()

        if target_status == PUBLISHED and note.status != PUBLISHED:
            if note.status == ARCHIVED:
                note.status = DRAFT
                note.archived_at = None
                note.save(update_fields=["status", "archived_at", "updated_at"])
            publish(note)
        elif target_status == ARCHIVED and note.status != ARCHIVED:
            archive(note)
    return note


def publish(note):
    if note.status == PUBLISHED:
        return note
    if note.status == ARCHIVED:
        raise ValidationError("Archived announcements cannot be published.")
    today = timezone.localdate()
    if note.publish_on and note.publish_on > today:
        raise ValidationError("The publication date is in the future. Set it to today or earlier.")
    if note.audience == SELECTED and not note.recipients.exists():
        raise ValidationError("Pick at least one member before publishing.")
    _check_pin_room(note)

    with transaction.atomic():
        note.status = PUBLISHED
        note.publish_on = note.publish_on or today
        note.published_at = timezone.now()
        note.save()
        user_model = get_user_model()
        if note.audience in (ALL, EVERYONE, "everyone", "EVERYONE"):
            users = user_model.objects.filter(role__in=["MEMBER", "TRAINER"], is_active=True)
            link = "member-home.html#announcements"
        elif note.audience in (MEMBERS, "members", "MEMBERS"):
            users = user_model.objects.filter(role="MEMBER", is_active=True)
            link = "member-home.html#announcements"
        elif note.audience in (TRAINERS, "trainers", "TRAINERS"):
            users = user_model.objects.filter(role="TRAINER", is_active=True)
            link = "trainer/announcements.html"
        else:
            users = note.recipients.all()
            link = "member-home.html#announcements"
        notify_many(
            list(users),
            f"New announcement: {note.title}",
            kind=Notification.Kind.ANNOUNCEMENT,
            body=note.message[:140],
            link=link,
        )
    return note


def archive(note):
    if note.status == ARCHIVED:
        return note
    note.status = ARCHIVED
    note.archived_at = timezone.now()
    note.pinned = False
    note.save()
    return note


def delete_announcement(note):
    note.delete()


def _safe_date(val):
    """Safely convert datetime, date, or date string into a datetime.date object without timezone crashes."""
    if not val:
        return None
    if isinstance(val, datetime.datetime):
        if timezone.is_aware(val):
            return timezone.localtime(val).date()
        return val.date()
    if isinstance(val, datetime.date):
        return val
    if isinstance(val, str):
        try:
            return datetime.date.fromisoformat(val[:10])
        except (ValueError, TypeError):
            return None
    return None


def get_staff_stats_and_counts():
    """Compute server-side announcement stats and filter pill counts."""
    today = timezone.localdate()
    all_qs = Announcement.objects.all()
    total_count = all_qs.count()
    draft_count = all_qs.filter(status=DRAFT).count()
    published_count = all_qs.filter(status=PUBLISHED).count()
    archived_count = all_qs.filter(status=ARCHIVED).count()

    live_now_count = (
        all_qs.filter(status=PUBLISHED)
        .filter(Q(publish_on__isnull=True) | Q(publish_on__lte=today))
        .count()
    )

    published_this_month = 0
    for pub_at, pub_on, created_at in all_qs.filter(status=PUBLISHED).values_list(
        "published_at", "publish_on", "created_at"
    ):
        dt_date = _safe_date(pub_at) or _safe_date(pub_on) or _safe_date(created_at)
        if dt_date and dt_date.year == today.year and dt_date.month == today.month:
            published_this_month += 1

    user_model = get_user_model()
    active_audience_users = user_model.objects.filter(
        role__in=["MEMBER", "TRAINER"], is_active=True
    ).count()
    unlinked_members = MemberProfile.objects.filter(
        user__isnull=True, membership_status="ACTIVE"
    ).count()
    people_count = active_audience_users + unlinked_members

    counts = {
        "all": total_count,
        "draft": draft_count,
        "published": published_count,
        "archived": archived_count,
    }
    stats = {
        "total": total_count,
        "published_this_month": published_this_month,
        "drafts": draft_count,
        "live_now": live_now_count,
        "people_count": people_count,
    }
    return stats, counts
