from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Role(models.TextChoices):
    """Fixed role set for ProFit, per the AGENTS.md RBAC matrix."""

    OWNER = "OWNER", "Owner"
    CASHIER = "CASHIER", "Cashier"
    TRAINER = "TRAINER", "Personal Trainer"
    MEMBER = "MEMBER", "Member"


class User(AbstractUser):
    """Custom user model carrying a single role enum.

    Extends AbstractUser (keeps username/password/email). The role drives the
    area-based RBAC policy single-sourced in apps/accounts/permissions.py.
    """

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.MEMBER,
    )


class OTPPurpose(models.TextChoices):
    """What an issued one-time code is for. Reserved for future reuse."""

    SIGNUP = "SIGNUP", "Signup"


class EmailOTP(models.Model):
    """A single issued one-time code targeting a not-yet-active ``User``.

    The plaintext code is NEVER stored or logged; only its Argon2 hash is kept
    (``code_hash``). The issuing service persists the row and the verify service
    reads the most recent SIGNUP row for the user.
    """

    MAX_ATTEMPTS = 5
    TTL = timedelta(minutes=10)
    RESEND_COOLDOWN = timedelta(seconds=60)

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="email_otps",
    )
    code_hash = models.CharField(max_length=128)
    purpose = models.CharField(
        max_length=20,
        choices=OTPPurpose.choices,
        default=OTPPurpose.SIGNUP,
    )
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "purpose", "created_at"]),
        ]

    def is_expired(self, now):
        """True when ``now`` is at or past the expiry instant."""
        return now >= self.expires_at

    def is_consumed(self):
        """True when the code has already been accepted (single-use)."""
        return self.consumed_at is not None

    def is_usable(self, now):
        """True when the code can still be verified against."""
        return (
            not self.is_expired(now)
            and not self.is_consumed()
            and self.attempts < self.MAX_ATTEMPTS
        )


class StaffInvite(models.Model):
    """An Owner-issued invitation to provision a staff (Cashier/Trainer) account.

    The raw token embedded in the invite link is NEVER stored or logged; only
    its Argon2 hash is kept (``token_hash``). The invitee cannot choose the role
    — it is fixed by the Owner at issue time.
    """

    TTL = timedelta(hours=72)

    email = models.EmailField()
    role = models.CharField(max_length=20, choices=Role.choices)
    token_hash = models.CharField(max_length=128)
    invited_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="sent_invites",
    )
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    accepted_user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    def clean(self):
        """Reject any role that is not a staff role (Cashier/Trainer).

        ``clean()`` is NOT called on plain ``.create()``; the service re-checks
        this (defense in depth). This guard is exercised directly via
        ``full_clean()`` in the tests.
        """
        if self.role not in {Role.CASHIER, Role.TRAINER}:
            raise ValidationError(
                {"role": "Staff invites may only assign Cashier or Trainer."}
            )

    def is_expired(self, now):
        """True when ``now`` is at or past the expiry instant."""
        return now >= self.expires_at

    def is_used(self):
        """True when the invite has already been accepted (single-use)."""
        return self.used_at is not None

    def is_usable(self, now):
        """True when the invite can still be accepted."""
        return not self.is_expired(now) and not self.is_used()
