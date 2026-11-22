"""Notification services. Other apps call these; they never write rows directly."""

import logging
from urllib.parse import urlparse

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.html import escape

from apps.accounts.services import role_home_url

from .models import Notification

logger = logging.getLogger("profit.notifications")


def _portal_url(link):
    clean = (link or "").strip()
    if not clean:
        return ""
    if clean.startswith(("http://", "https://")):
        return clean
    base = (getattr(settings, "SITE_BASE_URL", "") or "").rstrip("/")
    host = (urlparse(base).hostname or "").lower()
    if host == "www.functionalfitnessgym.site" or host.endswith(".vercel.app"):
        base = "https://functionalfitnessgym.site"
    if not base:
        return ""
    return f"{base}/{clean.lstrip('/')}"


def _send_notification_emails(notifications):
    """Best-effort email mirror of in-app notifications; never fails the caller."""
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "ProFit <noreply@functionalfitnessgym.site>")
    for note in notifications or ():
        recipient = getattr(note, "recipient", None)
        if recipient is None or not getattr(recipient, "is_active", False):
            continue
        email = (getattr(recipient, "email", "") or "").strip()
        if "@" not in email:
            continue

        target_url = _portal_url(role_home_url(recipient))
        text_lines = [note.title]
        if note.body:
            text_lines.extend(["", note.body])
        if target_url:
            text_lines.extend(["", f"Open in ProFit: {target_url}"])

        body_html = f"<p style=\"margin:0 0 16px;color:#334155;font-size:15px;line-height:1.5;\">{escape(note.body)}</p>" if note.body else ""
        button_html = (
            f'<p style="margin:20px 0 0;"><a href="{escape(target_url)}" '
            'style="display:inline-block;padding:10px 18px;border-radius:8px;'
            'background:#eab308;color:#0f172a;font-weight:700;text-decoration:none;'
            'font-size:14px;">Open ProFit Portal</a></p>'
            if target_url
            else ""
        )
        html_body = (
            '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;'
            'border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">'
            '<div style="background:#0f172a;color:#facc15;padding:16px 20px;font-weight:700;'
            'font-size:16px;letter-spacing:0.3px;">ProFit • Functional Fitness Gym</div>'
            f'<div style="padding:22px 20px;"><h2 style="margin:0 0 10px;color:#0f172a;font-size:18px;">{escape(note.title)}</h2>'
            f"{body_html}{button_html}</div>"
            '<div style="padding:12px 20px;background:#f8fafc;color:#64748b;font-size:12px;">'
            "Functional Fitness Gym • Member &amp; Staff Portal</div></div>"
        )

        try:
            send_mail(
                subject=f"ProFit: {note.title}",
                message="\n".join(text_lines),
                from_email=from_email,
                recipient_list=[email],
                html_message=html_body,
                fail_silently=False,
            )
        except Exception:
            logger.warning("event=notification_email_failed kind=%s", note.kind)


def notify(recipient, title, *, kind=Notification.Kind.GENERAL, body="", link=""):
    """Create one notification for ``recipient``. A missing recipient is ignored."""
    if recipient is None:
        return None
    note = Notification.objects.create(
        recipient=recipient,
        kind=kind,
        title=title[:160],
        body=body,
        link=link[:255],
    )
    _send_notification_emails([note])
    return note


def notify_many(recipients, title, *, kind=Notification.Kind.GENERAL, body="", link=""):
    """Create the same notification for several recipients in one query."""
    rows = [
        Notification(recipient=r, kind=kind, title=title[:160], body=body, link=link[:255])
        for r in recipients
        if r is not None
    ]
    created = Notification.objects.bulk_create(rows)
    _send_notification_emails(created)
    return created


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


def delete_notification(user, notification_id):
    """Delete one of the user's notifications. Raises LookupError if it is not theirs."""
    note = Notification.objects.filter(recipient=user, pk=notification_id).first()
    if note is None:
        raise LookupError("Notification not found.")
    pk = note.pk
    note.delete()
    return pk


def clear_notifications(user, *, read_only=False):
    """Delete all (or only read) notifications belonging to ``user``."""
    qs = Notification.objects.filter(recipient=user)
    if read_only:
        qs = qs.filter(read_at__isnull=False)
    deleted_count, _ = qs.delete()
    return deleted_count

