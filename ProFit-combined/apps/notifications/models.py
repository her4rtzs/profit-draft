from django.conf import settings
from django.db import models


class Notification(models.Model):
    """A notification stored in the database, for one recipient.

    Read state is ``read_at``: null means unread. Clicking a notification opens
    ``link``, which is a page in the portal.
    """

    class Kind(models.TextChoices):
        ANNOUNCEMENT = "ANNOUNCEMENT", "Announcement"
        TRAINER = "TRAINER", "Trainer"
        MEMBERSHIP = "MEMBERSHIP", "Membership"
        PAYMENT = "PAYMENT", "Payment"
        GENERAL = "GENERAL", "General"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.GENERAL)
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True, default="")
    link = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["recipient", "read_at"], name="notif_recipient_read_idx")]

    def __str__(self):
        return f"Notification<{self.pk} {self.kind} for {self.recipient_id}>"
