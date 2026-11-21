"""Membership services — the home of membership business logic.

Per AGENTS.md, business logic lives here and in model methods, never in views
or serializers. Views/serializers call these functions.
"""

import re
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

PLAN_DAYS = {"daily": 1, "monthly": 30, "quarterly": 90, "annual": 365, "other": 30}


FULL_NAME_ERROR = "Enter your first and last name."
PUBLIC_DUPLICATE_PHONE_ERROR = (
    "An account with this phone number already exists. "
    "Please sign in or contact the gym."
)


class DuplicatePhoneError(ValidationError):
    """Raised when a walk-in phone matches one or more existing member profiles."""

    def __init__(self, matches):
        self.matches = matches
        names = ", ".join(f"{m['name']} ({m['status']})" for m in matches[:3])
        super().__init__(
            f"This phone number is already used by: {names}. "
            "Confirm to continue if this is a shared family number."
        )


def validate_full_name(name):
    """Require a first name and last name (at least two words with letters)."""
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    parts = cleaned.split(" ") if cleaned else []
    if len(parts) < 2 or not re.search(r"[A-Za-z]", parts[0]) or not re.search(r"[A-Za-z]", parts[-1]):
        raise ValidationError(FULL_NAME_ERROR)
    return parts[0], " ".join(parts[1:])


def normalize_ph_phone(raw):
    """Normalize a Philippine phone number to its last 10 digits (e.g. 9171234567)."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) >= 12 and digits.startswith("63"):
        digits = digits[2:]
    elif len(digits) >= 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) < 10:
        return ""
    return digits[-10:]


def find_members_by_phone(phone, *, exclude_member_id=None):
    """Return existing MemberProfiles whose normalized phone matches ``phone``."""
    target = normalize_ph_phone(phone)
    if not target:
        return []
    qs = MemberProfile.objects.select_related("user").exclude(phone="")
    if exclude_member_id is not None:
        qs = qs.exclude(pk=exclude_member_id)
    matches = []
    for member in qs:
        if normalize_ph_phone(member.phone) == target:
            matches.append(member)
    return matches


def _split_name(name):
    first, _, last = (name or "").strip().partition(" ")
    return first, last.strip()


def create_member(*, name, email, password, phone="", address="", confirm_duplicate_phone=False):
    """Create an active MEMBER login and its MemberProfile.

    The username is the normalized email, which is how the login form and the
    web login (identity = email or username) find the account. Duplicate emails
    and passwords that fail Django's validators raise ``ValidationError``; no
    rows are written in that case.
    """
    from django.contrib.auth import get_user_model
    from django.contrib.auth.password_validation import validate_password

    from apps.accounts.validators import validate_real_email

    first, last = validate_full_name(name)

    User = get_user_model()
    raw_email = (email or "").strip()
    if not raw_email:
        raise ValidationError("Email is required.")
    username = validate_real_email(raw_email)
    if User.objects.filter(username=username).exists():
        raise ValidationError("An account with this email already exists.")

    if phone and not confirm_duplicate_phone:
        existing = find_members_by_phone(phone)
        if existing:
            match_list = [
                {
                    "id": m.id,
                    "name": f"{m.user.first_name} {m.user.last_name}".strip() or "Name not set",
                    "status": m.get_membership_status_display(),
                }
                for m in existing
            ]
            raise DuplicatePhoneError(match_list)

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
        first, last = validate_full_name(name)
        user = profile.user
        user.first_name, user.last_name = first, last
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


TRIAL_DAYS = 7

TRIAL_ENDED_MESSAGE = (
    "Your free trial has ended and you have no active membership. "
    "Pay at the desk or submit a GCash payment to activate your membership."
)
NO_MEMBERSHIP_MESSAGE = (
    "You have no active membership. "
    "Pay at the desk or submit a GCash payment to activate your membership."
)
TRIAL_PROFILE_ONLY_MESSAGE = (
    "Your free trial gives access to your profile only. "
    "Pay at the desk or submit a GCash payment to activate your membership."
)


def start_trial(member, *, now=None):
    """Put ``member`` in TRIAL for 7 days; the end is computed here, never passed in."""
    now = now or timezone.now()
    member.membership_status = MemberProfile.MembershipStatus.TRIAL
    member.trial_ends_at = now + timedelta(days=TRIAL_DAYS)
    member.save(update_fields=["membership_status", "trial_ends_at"])
    return member


def trial_is_active(member, *, today=None):
    """True while a TRIAL member is inside the 7 days, measured in Manila days."""
    today = today or timezone.localdate()
    return (
        member.membership_status == MemberProfile.MembershipStatus.TRIAL
        and member.trial_ends_at is not None
        and today <= timezone.localdate(member.trial_ends_at)
    )


def member_access(member, *, today=None):
    """Return ACTIVE, TRIAL or LOCKED for this request; expiry is computed now.

    No status is written here and no scheduled job is involved: an expired trial
    simply stops counting the moment the request is made.
    """
    today = today or timezone.localdate()
    if member.is_active_on(today):
        return "ACTIVE"
    if trial_is_active(member, today=today):
        return "TRIAL"
    return "LOCKED"


def register_trial_member(*, name, email, password, phone=""):
    """Create a MEMBER login and start its 7-day trial. Role is never caller-supplied."""
    validate_full_name(name)
    digits = re.sub(r"\D", "", phone or "")
    if not 10 <= len(digits) <= 13:
        raise ValidationError("Enter a valid mobile number (10 to 13 digits).")
    if find_members_by_phone(phone):
        raise ValidationError(PUBLIC_DUPLICATE_PHONE_ERROR)
    with transaction.atomic():
        profile = create_member(
            name=name,
            email=email,
            password=password,
            phone=phone or "",
            confirm_duplicate_phone=True,
        )
        return start_trial(profile)


def check_in_member(member, recorded_by):
    """Check a member in for today, only while the membership is active.

    Expired or pending members are refused so the front desk gets a clear reason
    instead of a silent check-in. Repeated taps the same day return the first row.
    """
    today = timezone.localdate()
    if not member.is_active_on(today):
        raise ValidationError("Membership is not active. Renew before checking in.")
    return record_attendance(member, recorded_by=recorded_by)
