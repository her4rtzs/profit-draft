from django.conf import settings
from django.db import models


class TrainerProfile(models.Model):
    """A trainer's public profile and capacity. The login is a user with role TRAINER."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trainer_profile",
        limit_choices_to={"role": "TRAINER"},
    )
    specialization = models.CharField(max_length=120, blank=True, default="")
    bio = models.TextField(blank=True, default="")
    availability = models.CharField(max_length=160, blank=True, default="")
    max_members = models.PositiveSmallIntegerField(default=20)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["user__first_name", "user__username"]

    def __str__(self):
        return f"TrainerProfile<{self.user_id}>"


class TrainerAssignment(models.Model):
    """Who trains a member, from ``assigned_at`` until ``ended_at``. Null ``ended_at`` means current."""

    member = models.ForeignKey(
        "membership.MemberProfile", on_delete=models.CASCADE, related_name="trainer_assignments"
    )
    trainer = models.ForeignKey(TrainerProfile, on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-assigned_at", "-id"]
        indexes = [models.Index(fields=["member", "ended_at"], name="trainer_assign_member_idx")]


class TrainerRequest(models.Model):
    """A member's request for a trainer. The owner approves or declines it."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        DECLINED = "DECLINED", "Declined"
        CANCELLED = "CANCELLED", "Cancelled"

    member = models.ForeignKey("membership.MemberProfile", on_delete=models.CASCADE, related_name="trainer_requests")
    trainer = models.ForeignKey(
        TrainerProfile, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests"
    )
    note = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
