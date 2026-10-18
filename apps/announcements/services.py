"""Announcement rules. Views call these; the rules live here, not in the views."""

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
DRAFT, PUBLISHED, ARCHIVED = Announcement.Status.DRAFT, Announcement.Status.PUBLISHED, Announcement.Status.ARCHIVED
ALL, SELECTED = Announcement.Audience.ALL, Announcement.Audience.SELECTED


def visible_to(user):
    """Published announcements that this member can see today."""
    if not user.is_authenticated or getattr(user, "role", None) != "MEMBER":
        return Announcement.objects.none()
    return (
        Announcement.objects.filter(status=PUBLISHED, publish_on__lte=timezone.localdate())
        .filter(Q(audience=ALL) | Q(recipients=user))
        .distinct()
    )


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
    others = Announcement.objects.filter(status=PUBLISHED, pinned=True).exclude(pk=announcement.pk).count()
    if others >= MAX_PINNED:
        raise ValidationError(f"Only {MAX_PINNED} pinned announcements are allowed. Unpin one first.")


def create_draft(*, title, message, audience, publish_on=None, pinned=False, member_ids=()):
    user_ids = _resolve_user_ids(member_ids) if audience == SELECTED else []
    with transaction.atomic():
        note = Announcement.objects.create(
            title=title[:160],
            message=message,
            audience=audience,
            publish_on=publish_on,
            pinned=pinned,
        )
        if user_ids:
            note.recipients.set(user_ids)
    return note


def update(note, *, title=None, message=None, audience=None, publish_on=None, pinned=None, member_ids=None):
    """Edit an announcement. Drafts can change everything. Published ones can change text and pin only,
    so members never see a different notice than the one they were alerted about."""
    if note.status == ARCHIVED:
        raise ValidationError("Archived announcements are read-only.")
    if note.status == PUBLISHED and (audience is not None or member_ids is not None or publish_on is not None):
        raise ValidationError("A published announcement's audience and date cannot change.")

    with transaction.atomic():
        if title is not None:
            note.title = title[:160]
        if message is not None:
            note.message = message
        if pinned is not None:
            note.pinned = pinned
            _check_pin_room(note)
        if note.status == DRAFT:
            if publish_on is not None:
                note.publish_on = publish_on
            if audience is not None:
                note.audience = audience
            if audience is not None or member_ids is not None:
                effective = note.audience
                if effective == SELECTED:
                    note.recipients.set(_resolve_user_ids(member_ids or []))
                else:
                    note.recipients.clear()
        note.save()
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
        if note.audience == ALL:
            users = get_user_model().objects.filter(role="MEMBER", is_active=True)
        else:
            users = note.recipients.all()
        notify_many(
            list(users),
            f"New announcement: {note.title}",
            kind=Notification.Kind.ANNOUNCEMENT,
            body=note.message[:140],
            link="member-home.html#announcements",
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
