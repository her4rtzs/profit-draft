"""Membership services — the home of membership business logic.

Per AGENTS.md, business logic lives here and in model methods, never in views
or serializers. Views/serializers call these functions.
"""

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
