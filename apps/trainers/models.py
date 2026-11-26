from django.conf import settings
from django.db import models


class TrainerProfile(models.Model):
    """A trainer's public profile and capacity. The login is a user with role TRAINER."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ON_LEAVE = "on_leave", "On Leave"
        INACTIVE = "inactive", "Inactive"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trainer_profile",
        limit_choices_to={"role": "TRAINER"},
    )
    phone = models.CharField(max_length=40, blank=True, default="")
    specialization = models.CharField(max_length=120, blank=True, default="")
    bio = models.TextField(blank=True, default="")
    availability = models.CharField(max_length=160, blank=True, default="")
    max_members = models.PositiveSmallIntegerField(default=20)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
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


class TrainerSession(models.Model):
    """A recurring weekly coaching class or session scheduled by a trainer."""

    DAY_CHOICES = [
        (0, "Sunday"),
        (1, "Monday"),
        (2, "Tuesday"),
        (3, "Wednesday"),
        (4, "Thursday"),
        (5, "Friday"),
        (6, "Saturday"),
    ]

    trainer = models.ForeignKey(
        TrainerProfile,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    name = models.CharField(max_length=120)
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_CHOICES)
    start_time = models.CharField(max_length=5)
    duration_mins = models.PositiveSmallIntegerField(default=45)
    capacity = models.PositiveSmallIntegerField(default=12)
    room = models.CharField(max_length=80, blank=True, default="Main Floor")
    notes = models.CharField(max_length=300, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["day_of_week", "start_time", "id"]
        indexes = [
            models.Index(fields=["trainer", "day_of_week"], name="trainer_sess_dow_idx"),
        ]

    def __str__(self):
        return f"TrainerSession<{self.pk}:{self.name}>"
