"""Membership domain models (Module 1).

Business logic lives in model methods here and in ``services.py`` — never in
views or serializers (per AGENTS.md). Day boundaries follow Asia/Manila via
``timezone.localdate()``; ``Attendance.save()`` materializes ``check_in_date``
so the ``(member, check_in_date)`` uniqueness invariant holds for EVERY caller.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class MemberProfile(models.Model):
    """Gym-domain data for a member, linked one-to-one to the auth User."""

    class MembershipStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        PENDING = "PENDING", "Pending"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="member_profile",
    )
    membership_status = models.CharField(
        max_length=20,
        choices=MembershipStatus.choices,
        default=MembershipStatus.PENDING,
    )
    date_joined = models.DateField(default=timezone.localdate)
    expiry_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"MemberProfile<{self.user_id}>"

    def is_active_on(self, date) -> bool:
        """Return True if the membership is ACTIVE and not expired on ``date``.

        A null ``expiry_date`` means no known expiry, so an ACTIVE profile is
        considered active on any date.
        """
        if self.membership_status != self.MembershipStatus.ACTIVE:
            return False
        if self.expiry_date is None:
            return True
        return date <= self.expiry_date

    def mark_expired(self):
        """Transition the profile to EXPIRED and persist that single change."""
        self.membership_status = self.MembershipStatus.EXPIRED
        self.save(update_fields=["membership_status"])


class Enrollment(models.Model):
    """A membership period for a member (the record of an enrollment)."""

    member = models.ForeignKey(
        MemberProfile,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_enrollments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Enrollment<{self.member_id} {self.start_date}..{self.end_date}>"

    def activate(self):
        """Activate the member for this enrollment period.

        Sets the member's status to ACTIVE and the expiry to this enrollment's
        ``end_date``, persisting only those two fields.
        """
        self.member.membership_status = MemberProfile.MembershipStatus.ACTIVE
        self.member.expiry_date = self.end_date
        self.member.save(update_fields=["membership_status", "expiry_date"])


class Attendance(models.Model):
    """A single check-in. At most one row per member per Manila day.

    ``check_in_date`` is derived from ``check_in_at`` in ``save()`` so the
    uniqueness invariant holds for every caller (service, admin, tests, future
    code) — SQLite has no functional-index support, so the derived date is a
    stored column that carries the UniqueConstraint.
    """

    member = models.ForeignKey(
        MemberProfile,
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    check_in_at = models.DateTimeField(default=timezone.now)
    check_in_date = models.DateField(editable=False)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_attendances",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["member", "check_in_date"],
                name="unique_member_check_in_date",
            ),
        ]

    def __str__(self):
        return f"Attendance<{self.member_id} {self.check_in_date}>"

    def save(self, *args, **kwargs):
        # Materialize the Manila day from check_in_at (defaulting to now) BEFORE
        # persisting, so the (member, check_in_date) invariant holds for every
        # caller regardless of entry point.
        self.check_in_date = timezone.localdate(self.check_in_at or timezone.now())
        super().save(*args, **kwargs)
