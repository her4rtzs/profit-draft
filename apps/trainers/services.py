"""Trainer assignment rules: capacity, changes, removal, and requests. Views call these."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.services import notify, notify_many

from .models import TrainerAssignment, TrainerRequest

KIND = Notification.Kind.TRAINER


def _name(user):
    return user.get_full_name() or user.username


def member_name(member):
    return _name(member.user)


def current_assignment(member):
    return (
        TrainerAssignment.objects.filter(member=member, ended_at__isnull=True)
        .select_related("trainer__user")
        .first()
    )


def load(trainer):
    return TrainerAssignment.objects.filter(trainer=trainer, ended_at__isnull=True).count()


def has_room(trainer, *, ignore_member=None):
    qs = TrainerAssignment.objects.filter(trainer=trainer, ended_at__isnull=True)
    if ignore_member is not None:
        qs = qs.exclude(member=ignore_member)
    return qs.count() < trainer.max_members


def assign_trainer(member, trainer, *, actor):
    """Give a member a trainer, or change their trainer. The old assignment is ended, not deleted."""
    if not trainer.is_active:
        raise ValidationError("This trainer is not accepting members right now.")
    current = current_assignment(member)
    if current and current.trainer_id == trainer.pk:
        raise ValidationError("This member already has that trainer.")
    if not has_room(trainer, ignore_member=member):
        raise ValidationError(f"{_name(trainer.user)} is at full capacity ({trainer.max_members} members).")

    previous = current.trainer if current else None
    with transaction.atomic():
        if current:
            current.ended_at = timezone.now()
            current.save(update_fields=["ended_at"])
        new = TrainerAssignment.objects.create(member=member, trainer=trainer, assigned_by=actor)
        if previous:
            notify(previous.user, f"{member_name(member)} was reassigned", kind=KIND,
                   body="They now train with another coach.", link="trainer-portal.html")
            body = f"Your trainer changed from {_name(previous.user)} to {_name(trainer.user)}."
        else:
            body = f"{_name(trainer.user)} is now your trainer."
        notify(member.user, "Trainer assignment updated", kind=KIND, body=body, link="member-home.html#profile")
        notify(trainer.user, f"New member: {member_name(member)}", kind=KIND,
               body="Check their goals in the trainer portal.", link="trainer-portal.html")
    return new


def remove_trainer(member, *, actor):
    current = current_assignment(member)
    if current is None:
        raise ValidationError("This member has no trainer to remove.")
    with transaction.atomic():
        current.ended_at = timezone.now()
        current.save(update_fields=["ended_at"])
        notify(member.user, "Trainer removed", kind=KIND,
               body=f"{_name(current.trainer.user)} is no longer your trainer.", link="member-home.html#profile")
        notify(current.trainer.user, f"{member_name(member)} is no longer assigned to you", kind=KIND,
               body="The member has been removed from your list.", link="trainer-portal.html")
    return current


def request_trainer(member, *, trainer=None, note=""):
    if TrainerRequest.objects.filter(member=member, status=TrainerRequest.Status.PENDING).exists():
        raise ValidationError("You already have a pending trainer request.")
    if trainer is not None and not trainer.is_active:
        raise ValidationError("That trainer is not accepting members right now.")
    with transaction.atomic():
        req = TrainerRequest.objects.create(member=member, trainer=trainer, note=note[:500])
        owners = get_user_model().objects.filter(role="OWNER", is_active=True)
        notify_many(list(owners), "New trainer request", kind=KIND,
                    body=f"{member_name(member)} asked for a trainer.", link="trainers.html")
    return req


def cancel_request(req):
    if req.status != TrainerRequest.Status.PENDING:
        raise ValidationError("Only a pending request can be cancelled.")
    req.status = TrainerRequest.Status.CANCELLED
    req.decided_at = timezone.now()
    req.save(update_fields=["status", "decided_at"])
    return req


def decide_request(req, *, approve, actor, trainer=None):
    if req.status != TrainerRequest.Status.PENDING:
        raise ValidationError("This request was already decided.")
    with transaction.atomic():
        if approve:
            chosen = trainer or req.trainer
            if chosen is None:
                raise ValidationError("Choose a trainer to approve this request.")
            assign_trainer(req.member, chosen, actor=actor)
            req.status = TrainerRequest.Status.APPROVED
        else:
            req.status = TrainerRequest.Status.DECLINED
            notify(req.member.user, "Trainer request declined", kind=KIND,
                   body="The gym could not match you with that trainer. Ask the front desk for options.",
                   link="member-home.html#profile")
        req.decided_by = actor
        req.decided_at = timezone.now()
        req.save(update_fields=["status", "decided_by", "decided_at"])
    return req


# ---------------------------------------------------------------------------
# Trainer Attendance Analytics (Single Source of Truth)
# ---------------------------------------------------------------------------
# Canonical definitions used across the Trainer Coach Dashboard and API:
# - scheduled:       Sessions or visits expected for that time bucket based on
#                    active assigned memberships/enrollments (at least checked_in).
# - checked_in:      Scheduled visits that have a recorded Attendance check-in
#                    (written by the Staff, Member, or Kiosk portals).
# - missed:          scheduled - checked_in (clamped so it is never negative).
# - attendance_rate: round((checked_in / scheduled) * 100, 1), or None (JSON null)
#                    when scheduled is 0.

MAX_ATTENDANCE_BUCKETS = 60

GRANULARITY_ALIASES = {
    "day": "day",
    "days": "day",
    "week": "week",
    "weeks": "week",
    "month": "month",
    "months": "month",
    "year": "year",
    "years": "year",
}

PERIOD_LABELS = {
    "day": "days",
    "week": "weeks",
    "month": "months",
    "year": "years",
}


def compute_attendance_bucket_metrics(checked_in: int, scheduled: int) -> dict:
    """Compute canonical ``checked_in``, ``scheduled``, ``missed``, and ``attendance_rate``.

    Definitions:
    - ``scheduled``: sessions or visits expected for the bucket.
    - ``checked_in``: scheduled visits that have a check-in record.
    - ``missed``: ``scheduled - checked_in``, never negative.
    - ``attendance_rate``: ``checked_in / scheduled * 100`` (rounded to 1 decimal),
      or ``None`` when ``scheduled`` is 0.
    """
    c = max(0, int(checked_in))
    s = max(c, int(scheduled))
    missed = max(0, s - c)
    rate = round((c / s) * 100, 1) if s > 0 else None
    return {
        "checked_in": c,
        "scheduled": s,
        "missed": missed,
        "attendance_rate": rate,
        "rate": rate,
    }


def _month_end_date(year: int, month: int):
    if month == 12:
        return timezone.datetime(year, 12, 31).date()
    return timezone.datetime(year, month + 1, 1).date() - timezone.timedelta(days=1)


def get_trainer_assigned_members(profile) -> tuple[set[int], list[dict]]:
    """Return ``(assigned_ids_set, assigned_members_list)`` for ``profile``.

    Shared by ``GET /api/trainer/attendance/``, ``GET /api/trainer/dashboard/``, and
    ``GET /api/trainer/members/`` so the frontend member dropdown and backend
    ``member_id`` validation always read from the exact same source.
    """
    if profile is None:
        return set(), []
    assignments = list(
        TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
        .select_related("member__user")
        .order_by("member_id")
    )
    assigned_ids = {a.member_id for a in assignments}
    assigned_members = [
        {
            "id": a.member_id,
            "name": _name(a.member.user),
        }
        for a in assignments
    ]
    return assigned_ids, assigned_members


def build_trainer_attendance_series(
    *,
    assigned_ids: set[int],
    assigned_members: list[dict] | None = None,
    granularity_raw: str | None = None,
    from_raw: str | None = None,
    to_raw: str | None = None,
    member_raw: str | None = None,
) -> tuple[int, dict]:
    """Aggregate attendance buckets in Asia/Manila time from ``Attendance`` & ``MemberProfile``.

    Returns ``(http_status, payload_dict)``.
    - Enforces that ``member_raw`` belongs to ``assigned_ids`` (returns 403 otherwise).
    - Returns 400 only when ``member_raw`` is malformed (neither ``'all'`` nor a positive integer).
    - Uses ``Asia/Manila`` local dates and Monday-start weeks.
    - Caps bucket count at ``MAX_ATTENDANCE_BUCKETS`` (60), returning 400 if exceeded.
    """
    from apps.membership.models import Attendance, Enrollment, MemberProfile

    today = timezone.localdate()
    clean_gran = str(granularity_raw or "day").strip().rstrip("/").lower()
    granularity = GRANULARITY_ALIASES.get(clean_gran, "day")

    raw_member_str = str(member_raw or "all").strip().rstrip("/")
    if raw_member_str.lower() not in ("all", ""):
        try:
            mid = int(raw_member_str)
        except (ValueError, TypeError):
            return 400, {
                "detail": f"Malformed member_id '{raw_member_str}': expected a numeric member ID or 'all'."
            }
        if mid <= 0:
            return 400, {
                "detail": f"Malformed member_id '{raw_member_str}': expected a positive integer ID or 'all'."
            }
        if mid not in assigned_ids:
            return 403, {
                "detail": f"Member {mid} is not assigned to this trainer."
            }
        target_ids = {mid}
        member_filter: str | int = mid
    else:
        target_ids = set(assigned_ids)
        member_filter = "all"

    if granularity == "week":
        default_from = today - timezone.timedelta(days=55)
    elif granularity == "month":
        y, m = today.year, today.month - 5
        while m <= 0:
            m += 12
            y -= 1
        default_from = timezone.datetime(y, m, 1).date()
    elif granularity == "year":
        default_from = timezone.datetime(today.year - 2, 1, 1).date()
    else:
        default_from = today - timezone.timedelta(days=13)

    def _parse_date(val, fallback):
        if not val:
            return fallback
        s = str(val).strip().rstrip("/")
        try:
            return timezone.datetime.fromisoformat(s).date()
        except (ValueError, TypeError):
            pass
        try:
            return timezone.datetime.strptime(s, "%m/%d/%Y").date()
        except (ValueError, TypeError):
            return None

    from_date = _parse_date(from_raw, default_from)
    to_date = _parse_date(to_raw, today)
    if from_date is None or to_date is None:
        return 400, {"detail": "Pick a valid date range."}

    if from_date > to_date:
        from_date, to_date = to_date, from_date

    # Construct bucket windows first and enforce the bucket cap (~60)
    bucket_specs = []
    one_day = timezone.timedelta(days=1)

    if granularity == "day":
        total_days = (to_date - from_date).days + 1
        if total_days > MAX_ATTENDANCE_BUCKETS:
            return 400, {
                "detail": f"Date range is too large ({total_days} days; maximum {MAX_ATTENDANCE_BUCKETS} buckets allowed). Switch to Weeks or Months, or pick a shorter range."
            }
        cur = from_date
        while cur <= to_date:
            bucket_specs.append({
                "start": cur.isoformat(),
                "label": f"{cur.strftime('%b')} {cur.day}",
                "tooltip_label": f"{cur.strftime('%b')} {cur.day}, {cur.year}",
                "d_start": cur,
                "d_end": cur,
            })
            cur += one_day

    elif granularity == "week":
        # Weeks start on Monday (weekday() == 0)
        first_monday = from_date - timezone.timedelta(days=from_date.weekday())
        last_monday = to_date - timezone.timedelta(days=to_date.weekday())
        total_weeks = ((last_monday - first_monday).days // 7) + 1
        if total_weeks > MAX_ATTENDANCE_BUCKETS:
            return 400, {
                "detail": f"Date range is too large ({total_weeks} weeks; maximum {MAX_ATTENDANCE_BUCKETS} buckets allowed). Switch to Months or Years, or pick a shorter range."
            }
        cur_mon = first_monday
        while cur_mon <= to_date:
            cur_sun = cur_mon + timezone.timedelta(days=6)
            w_start = max(from_date, cur_mon)
            w_end = min(to_date, cur_sun)
            bucket_specs.append({
                "start": cur_mon.isoformat(),
                "label": f"{cur_mon.strftime('%b')} {cur_mon.day}",
                "tooltip_label": f"{cur_mon.strftime('%b')} {cur_mon.day} – {cur_sun.strftime('%b')} {cur_sun.day}, {cur_sun.year}",
                "d_start": w_start,
                "d_end": w_end,
            })
            cur_mon += timezone.timedelta(days=7)

    elif granularity == "month":
        total_months = (to_date.year - from_date.year) * 12 + (to_date.month - from_date.month) + 1
        if total_months > MAX_ATTENDANCE_BUCKETS:
            return 400, {
                "detail": f"Date range is too large ({total_months} months; maximum {MAX_ATTENDANCE_BUCKETS} buckets allowed). Switch to Years or pick a shorter range."
            }
        y, m = from_date.year, from_date.month
        same_year = from_date.year == to_date.year
        while (y, m) <= (to_date.year, to_date.month):
            first_d = timezone.datetime(y, m, 1).date()
            last_d = _month_end_date(y, m)
            bucket_specs.append({
                "start": first_d.isoformat(),
                "label": first_d.strftime("%b") if same_year else first_d.strftime("%b '%y"),
                "tooltip_label": first_d.strftime("%B %Y"),
                "d_start": max(from_date, first_d),
                "d_end": min(to_date, last_d),
            })
            m += 1
            if m > 12:
                m = 1
                y += 1

    else:  # year
        total_years = (to_date.year - from_date.year) + 1
        if total_years > MAX_ATTENDANCE_BUCKETS:
            return 400, {
                "detail": f"Date range is too large ({total_years} years; maximum {MAX_ATTENDANCE_BUCKETS} buckets allowed)."
            }
        for y in range(from_date.year, to_date.year + 1):
            first_d = timezone.datetime(y, 1, 1).date()
            last_d = timezone.datetime(y, 12, 31).date()
            bucket_specs.append({
                "start": first_d.isoformat(),
                "label": str(y),
                "tooltip_label": str(y),
                "d_start": max(from_date, first_d),
                "d_end": min(to_date, last_d),
            })

    # Query single source of truth: Attendance, MemberProfile, Enrollment
    daily_checkins: dict = {}
    active_profiles = []
    enrollment_spans: dict[int, list[tuple]] = {}

    if target_ids:
        att_rows = Attendance.objects.filter(
            member_id__in=target_ids,
            check_in_date__gte=from_date,
            check_in_date__lte=to_date,
        ).values_list("member_id", "check_in_date")
        for mid, cdate in att_rows:
            daily_checkins.setdefault(cdate, set()).add(mid)

        active_profiles = list(
            MemberProfile.objects.filter(id__in=target_ids).only(
                "id", "membership_status", "date_joined", "expiry_date"
            )
        )
        for enr in Enrollment.objects.filter(
            member_id__in=target_ids,
            end_date__gte=from_date,
            start_date__lte=to_date,
        ).values_list("member_id", "start_date", "end_date"):
            enrollment_spans.setdefault(enr[0], []).append((enr[1], enr[2]))

    def _expected_on_day(day) -> tuple[int, int]:
        checked_set = daily_checkins.get(day, set())
        c_count = len(checked_set)
        if day > today or not active_profiles:
            return c_count, c_count

        s_count = 0
        for prof in active_profiles:
            if prof.id in checked_set:
                s_count += 1
                continue
            spans = enrollment_spans.get(prof.id, [])
            in_enrollment = any(st <= day <= en for st, en in spans)
            if in_enrollment or (
                prof.is_active_on(day)
                and (prof.date_joined is None or day >= prof.date_joined)
            ):
                s_count += 1
        return c_count, max(c_count, s_count)

    buckets = []
    for spec in bucket_specs:
        c_sum = 0
        s_sum = 0
        cur = spec["d_start"]
        while cur <= spec["d_end"]:
            c_day, s_day = _expected_on_day(cur)
            c_sum += c_day
            s_sum += s_day
            cur += one_day
        metrics = compute_attendance_bucket_metrics(c_sum, s_sum)
        buckets.append({
            "start": spec["start"],
            "key": spec["start"],
            "label": spec["label"],
            "tooltip_label": spec["tooltip_label"],
            **metrics,
        })

    total_checked_in = sum(b["checked_in"] for b in buckets)
    total_scheduled = sum(b["scheduled"] for b in buckets)
    summary_metrics = compute_attendance_bucket_metrics(total_checked_in, total_scheduled)

    return 200, {
        "granularity": granularity,
        "period": PERIOD_LABELS[granularity],
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "member_id": member_filter,
        "assigned_members": assigned_members if assigned_members is not None else [],
        "updated_at": timezone.now().isoformat(),
        "buckets": buckets,
        "summary": summary_metrics,
    }

