from django.conf import settings
from django.db import models


class Announcement(models.Model):
    """A notice from the gym to its members.

    Draft and archived announcements are never shown to members. A published one
    is shown to everyone (audience ALL) or only to ``recipients`` (SELECTED).
    ``publish_on`` is the publication date members see.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        ARCHIVED = "ARCHIVED", "Archived"

    class Audience(models.TextChoices):
        ALL = "ALL", "All members"
        SELECTED = "SELECTED", "Selected members"

    title = models.CharField(max_length=160)
    message = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    audience = models.CharField(max_length=20, choices=Audience.choices, default=Audience.ALL)
    publish_on = models.DateField(null=True, blank=True)
    pinned = models.BooleanField(default=False)
    recipients = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="targeted_announcements")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-pinned", "-publish_on", "-id"]
        indexes = [models.Index(fields=["status"], name="announce_status_idx")]

    def __str__(self):
        return f"Announcement<{self.pk} {self.status} {self.title[:30]}>"
