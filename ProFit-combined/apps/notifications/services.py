"""Notification services. Other apps call these; they never write rows directly."""

from django.utils import timezone

from .models import Notification


def notify(recipient, title, *, kind=Notification.Kind.GENERAL, body="", link=""):
    """Create one notification for ``recipient``. A missing recipient is ignored."""
    if recipient is None:
        return None
    return Notification.objects.create(
        recipient=recipient,
        kind=kind,
        title=title[:160],
        body=body,
        link=link[:255],
    )


def notify_many(recipients, title, *, kind=Notification.Kind.GENERAL, body="", link=""):
    """Create the same notification for several recipients in one query."""
    rows = [
        Notification(recipient=r, kind=kind, title=title[:160], body=body, link=link[:255])
        for r in recipients
        if r is not None
    ]
    return Notification.objects.bulk_create(rows)


def unread_count(user):
    return Notification.objects.filter(recipient=user, read_at__isnull=True).count()


def mark_read(user, notification_id):
    """Mark one of the user's notifications read. Raises LookupError if it is not theirs."""
    note = Notification.objects.filter(recipient=user, pk=notification_id).first()
    if note is None:
        raise LookupError("Notification not found.")
    if note.read_at is None:
        note.read_at = timezone.now()
        note.save(update_fields=["read_at"])
    return note


def mark_all_read(user):
    return Notification.objects.filter(recipient=user, read_at__isnull=True).update(read_at=timezone.now())
