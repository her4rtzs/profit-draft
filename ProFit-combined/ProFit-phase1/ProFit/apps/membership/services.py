"""Membership services — the home of membership business logic.

Per AGENTS.md, business logic lives here and in model methods, never in views
or serializers. Views/serializers call these functions.
"""

from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Attendance, Enrollment, MemberProfile


def enroll_member(member, start_date, end_date, created_by):
    """Create and activate an Enrollment for ``member``.

    Requires ``end_date > start_date``; raises ``ValidationError`` otherwise and
    makes NO database write (the whole operation is atomic, so a failed
    validation rolls back cleanly).

    Returns the created, activated ``Enrollment``.
    """
    if not (end_date > start_date):
        raise ValidationError("end_date must be after start_date.")

    with transaction.atomic():
        enrollment = Enrollment.objects.create(
            member=member,
            start_date=start_date,
            end_date=end_date,
            created_by=created_by,
        )
        enrollment.activate()
    return enrollment


def record_attendance(member, check_in_at=None, recorded_by=None):
    """Record a check-in for ``member``, idempotent per Manila day.

    Computes the day via ``timezone.localdate(check_in_at or now())`` — the same
    derivation ``Attendance.save()`` uses — and inserts inside a transaction. A
    duplicate same-day check-in trips the ``(member, check_in_date)`` unique
    constraint; on ``IntegrityError`` the existing row is re-queried by
    ``(member, check_in_date=the_date)`` (NOT by ``check_in_at``) and returned,
    so a second tap later the same Manila day resolves to the original row.
    """
    the_date = timezone.localdate(check_in_at or timezone.now())
    try:
        with transaction.atomic():
            return Attendance.objects.create(
                member=member,
                check_in_at=check_in_at or timezone.now(),
                recorded_by=recorded_by,
            )
    except IntegrityError:
        return Attendance.objects.get(member=member, check_in_date=the_date)


# --- Phase 1: staff member management and check-in --------------------------

PLAN_DAYS = {"monthly": 30, "quarterly": 90, "annual": 365}


def _split_name(name):
    first, _, last = (name or "").strip().partition(" ")
    return first, last.strip()


def create_member(*, name, email, password, phone="", address=""):
    """Create an active MEMBER login and its MemberProfile.

    The username is the normalized email, which is how the login form and the
    web login (identity = email or username) find the account. Duplicate emails
    and passwords that fail Django's validators raise ``ValidationError``; no
    rows are written in that case.
    """
    from django.contrib.auth import get_user_model
    from django.contrib.auth.password_validation import validate_password

    User = get_user_model()
    username = (email or "").strip().lower()
    if not username:
        raise ValidationError("Email is required.")
    if User.objects.filter(username=username).exists():
        raise ValidationError("An account with this email already exists.")

    first, last = _split_name(name)
    user = User(
        username=username,
        email=username,
        first_name=first,
        last_name=last,
        role="MEMBER",
        is_active=True,
    )
    validate_password(password, user)

    with transaction.atomic():
        user.set_password(password)
        user.save()
        profile = MemberProfile.objects.create(
            user=user,
            phone=phone or "",
            address=address or "",
            membership_status=MemberProfile.MembershipStatus.PENDING,
        )
    return profile


def update_member_profile(profile, *, name=None, phone=None, address=None):
    """Update the editable staff fields on a member. ``None`` means unchanged."""
    if name is not None:
        user = profile.user
        user.first_name, user.last_name = _split_name(name)
        user.save(update_fields=["first_name", "last_name"])

    changed = []
    if phone is not None:
        profile.phone = phone
        changed.append("phone")
    if address is not None:
        profile.address = address
        changed.append("address")
    if changed:
        profile.save(update_fields=changed)
    return profile


def renew_member(member, plan, created_by, start_date=None):
    """Start a new enrollment period from ``plan`` (monthly, quarterly, annual)."""
    if plan not in PLAN_DAYS:
        raise ValidationError("Unknown plan.")
    start = start_date or timezone.localdate()
    end = start + timedelta(days=PLAN_DAYS[plan])
    return enroll_member(member, start, end, created_by=created_by)


def check_in_member(member, recorded_by):
    """Check a member in for today, only while the membership is active.

    Expired or pending members are refused so the front desk gets a clear reason
    instead of a silent check-in. Repeated taps the same day return the first row.
    """
    today = timezone.localdate()
    if not member.is_active_on(today):
        raise ValidationError("Membership is not active. Renew before checking in.")
    return record_attendance(member, recorded_by=recorded_by)
