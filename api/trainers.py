"""Trainer endpoints: the owner manages trainers and assignments; members pick or request one."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.announcements.models import Announcement
from apps.membership.models import Attendance, MemberProfile
from apps.notifications.models import Notification
from apps.notifications.services import notify_many
from apps.trainers import services
from apps.trainers.models import TrainerAssignment, TrainerProfile, TrainerRequest
from django.utils import timezone


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and getattr(request.user, "role", "") == "OWNER")


class IsMember(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and getattr(request.user, "role", "") == "MEMBER")


class IsTrainerOrOwner(BasePermission):
    """Permits access to users with role TRAINER or OWNER."""
    def has_permission(self, request, view):
        return bool(
            request.user.is_authenticated and
            getattr(request.user, "role", "") in ("TRAINER", "OWNER")
        )


def _name(user):
    return user.get_full_name() or user.username


def _fail(exc):
    raise ValidationError({"detail": " ".join(exc.messages)})


def _trainer_json(t):
    load = services.load(t)
    return {
        "id": t.pk,
        "name": _name(t.user),
        "specialization": t.specialization,
        "bio": t.bio,
        "availability": t.availability,
        "max_members": t.max_members,
        "load": load,
        "is_full": load >= t.max_members,
        "is_active": t.is_active,
    }


def _request_json(r):
    return {
        "id": r.pk,
        "status": r.status,
        "note": r.note,
        "member_id": r.member_id,
        "member_name": _name(r.member.user),
        "trainer_id": r.trainer_id,
        "trainer_name": _name(r.trainer.user) if r.trainer_id else None,
        "created_at": r.created_at,
    }


# ----- owner -------------------------------------------------------------------------

class StaffTrainerListView(APIView):
    """GET trainers with their workload. POST creates a profile for a user with role TRAINER."""

    permission_classes = [IsOwner]

    def get(self, request):
        rows = TrainerProfile.objects.select_related("user")
        return Response([_trainer_json(t) for t in rows])

    def post(self, request):
        user_id = request.data.get("user_id")
        User = get_user_model()
        user = User.objects.filter(pk=user_id, role="TRAINER").first()
        if user is None:
            return Response({"detail": "Pick a user whose role is Trainer."}, status=400)
        if TrainerProfile.objects.filter(user=user).exists():
            return Response({"detail": "This trainer already has a profile."}, status=400)
        profile = TrainerProfile.objects.create(user=user, **_profile_fields(request.data, creating=True))
        return Response(_trainer_json(profile), status=201)


class StaffTrainerCandidatesView(APIView):
    """GET trainer logins that do not have a profile yet."""

    permission_classes = [IsOwner]

    def get(self, request):
        User = get_user_model()
        rows = User.objects.filter(role="TRAINER", trainer_profile__isnull=True).order_by("username")
        return Response([{"id": u.pk, "name": _name(u), "email": u.email} for u in rows])


class StaffTrainerDetailView(APIView):
    permission_classes = [IsOwner]

    def patch(self, request, pk):
        profile = TrainerProfile.objects.select_related("user").filter(pk=pk).first()
        if profile is None:
            return Response({"detail": "Trainer not found."}, status=404)
        for key, value in _profile_fields(request.data, creating=False).items():
            setattr(profile, key, value)
        profile.save()
        return Response(_trainer_json(profile))


def _profile_fields(data, *, creating):
    fields = {}
    for key in ("specialization", "bio", "availability"):
        if key in data:
            fields[key] = str(data.get(key) or "")[:500 if key == "bio" else 160]
    if "max_members" in data:
        try:
            cap = int(data.get("max_members"))
        except (TypeError, ValueError):
            cap = -1
        if cap < 1 or cap > 200:
            raise ValidationError({"detail": "Capacity must be between 1 and 200."})
        fields["max_members"] = cap
    if "is_active" in data:
        fields["is_active"] = bool(data.get("is_active"))
    elif creating:
        fields["is_active"] = True
    return fields


class StaffMemberTrainerView(APIView):
    """POST {"trainer_id": n} assigns or changes a member's trainer. Confirmation is on the page."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        member = MemberProfile.objects.select_related("user").filter(pk=pk).first()
        trainer = TrainerProfile.objects.select_related("user").filter(pk=request.data.get("trainer_id")).first()
        if member is None:
            return Response({"detail": "Member not found."}, status=404)
        if trainer is None:
            return Response({"detail": "Trainer not found."}, status=404)
        try:
            services.assign_trainer(member, trainer, actor=request.user)
        except DjangoValidationError as exc:
            _fail(exc)
        return Response({"detail": f"{_name(member.user)} now trains with {_name(trainer.user)}."})


class StaffMemberTrainerRemoveView(APIView):
    permission_classes = [IsOwner]

    def post(self, request, pk):
        member = MemberProfile.objects.select_related("user").filter(pk=pk).first()
        if member is None:
            return Response({"detail": "Member not found."}, status=404)
        try:
            services.remove_trainer(member, actor=request.user)
        except DjangoValidationError as exc:
            _fail(exc)
        return Response({"detail": f"{_name(member.user)} no longer has a trainer."})


class StaffTrainerRequestListView(APIView):
    permission_classes = [IsOwner]

    def get(self, request):
        rows = TrainerRequest.objects.select_related("member__user", "trainer__user")
        status = request.query_params.get("status", "PENDING")
        if status:
            rows = rows.filter(status=status)
        return Response([_request_json(r) for r in rows[:100]])


class StaffTrainerRequestDecideView(APIView):
    """POST {"approve": true, "trainer_id": n?} or {"approve": false}."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        req = TrainerRequest.objects.select_related("member__user", "trainer__user").filter(pk=pk).first()
        if req is None:
            return Response({"detail": "Request not found."}, status=404)
        trainer = None
        if request.data.get("trainer_id"):
            trainer = TrainerProfile.objects.select_related("user").filter(pk=request.data.get("trainer_id")).first()
            if trainer is None:
                return Response({"detail": "Trainer not found."}, status=404)
        try:
            services.decide_request(req, approve=bool(request.data.get("approve")), actor=request.user, trainer=trainer)
        except DjangoValidationError as exc:
            _fail(exc)
        req.refresh_from_db()
        return Response(_request_json(req))


# ----- member -------------------------------------------------------------------------

def _member_profile(user):
    return MemberProfile.objects.filter(user=user).first()


class MemberTrainerView(APIView):
    """GET my current trainer, my pending request, and the trainers I can pick from."""

    permission_classes = [IsMember]

    def get(self, request):
        profile = _member_profile(request.user)
        if profile is None:
            return Response({"detail": "No membership profile found."}, status=404)
        current = services.current_assignment(profile)
        pending = TrainerRequest.objects.filter(member=profile, status=TrainerRequest.Status.PENDING).first()
        options = [_trainer_json(t) for t in TrainerProfile.objects.filter(is_active=True).select_related("user")]
        return Response({
            "trainer": _trainer_json(current.trainer) if current else None,
            "pending_request": _request_json(pending) if pending else None,
            "options": options,
        })


class MemberTrainerRequestView(APIView):
    """POST {"trainer_id": n?, "note": "..."} asks for a trainer. The owner decides."""

    permission_classes = [IsMember]

    def post(self, request):
        profile = _member_profile(request.user)
        if profile is None:
            return Response({"detail": "No membership profile found."}, status=404)
        trainer = None
        if request.data.get("trainer_id"):
            trainer = TrainerProfile.objects.filter(pk=request.data.get("trainer_id")).first()
            if trainer is None:
                return Response({"detail": "Trainer not found."}, status=404)
        try:
            req = services.request_trainer(profile, trainer=trainer, note=str(request.data.get("note") or ""))
        except DjangoValidationError as exc:
            _fail(exc)
        return Response(_request_json(req), status=201)


class MemberTrainerRequestCancelView(APIView):
    permission_classes = [IsMember]

    def post(self, request, pk):
        profile = _member_profile(request.user)
        req = TrainerRequest.objects.filter(pk=pk, member=profile).first() if profile else None
        if req is None:
            return Response({"detail": "Request not found."}, status=404)
        try:
            services.cancel_request(req)
        except DjangoValidationError as exc:
            _fail(exc)
        return Response(_request_json(req))


# ----- trainer portal views -----------------------------------------------------------

def _get_trainer_profile_for_user(user):
    if getattr(user, "role", "") == "TRAINER":
        profile, _ = TrainerProfile.objects.get_or_create(
            user=user,
            defaults={
                "specialization": "Functional Training & Conditioning",
                "max_members": 20,
                "is_active": True,
            },
        )
        return profile
    elif getattr(user, "role", "") == "OWNER":
        profile = TrainerProfile.objects.filter(user=user).first()
        if not profile:
            profile = TrainerProfile.objects.first()
        return profile
    return None


class TrainerProfileView(APIView):
    """GET/PATCH the logged-in trainer's own profile and settings."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        profile = _get_trainer_profile_for_user(request.user)
        if profile is None:
            return Response({"detail": "Trainer profile not found."}, status=404)
        load = services.load(profile)
        return Response({
            "id": profile.pk,
            "user_id": profile.user_id,
            "name": _name(profile.user),
            "email": profile.user.email,
            "username": profile.user.username,
            "specialization": profile.specialization,
            "bio": profile.bio,
            "availability": profile.availability,
            "max_members": profile.max_members,
            "load": load,
            "is_full": load >= profile.max_members,
            "is_active": profile.is_active,
            "created_at": profile.created_at,
        })

    def patch(self, request):
        profile = _get_trainer_profile_for_user(request.user)
        if profile is None:
            return Response({"detail": "Trainer profile not found."}, status=404)
        data = request.data
        if "specialization" in data:
            profile.specialization = str(data["specialization"] or "")[:120]
        if "bio" in data:
            profile.bio = str(data["bio"] or "")[:500]
        if "availability" in data:
            profile.availability = str(data["availability"] or "")[:160]
        profile.save()
        return Response({
            "detail": "Profile updated successfully.",
            "specialization": profile.specialization,
            "bio": profile.bio,
            "availability": profile.availability,
        })


class TrainerMembersView(APIView):
    """GET members currently assigned to the logged-in trainer."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        profile = _get_trainer_profile_for_user(request.user)
        if profile is None:
            return Response([])
        today = timezone.localdate()
        assignments = (
            TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
            .select_related("member__user")
            .order_by("-assigned_at")
        )
        res = []
        for a in assignments:
            m = a.member
            last_att = Attendance.objects.filter(member=m).order_by("-check_in_at").first()
            total_checkins = Attendance.objects.filter(member=m).count()
            today_in = Attendance.objects.filter(member=m, check_in_date=today).exists()
            res.append({
                "id": m.pk,
                "user_id": m.user_id,
                "name": _name(m.user),
                "email": m.user.email,
                "phone": m.phone,
                "membership_status": m.membership_status,
                "is_active": m.is_active_on(today),
                "expiry_date": m.expiry_date.isoformat() if m.expiry_date else None,
                "date_joined": m.date_joined.isoformat() if m.date_joined else None,
                "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
                "total_checkins": total_checkins,
                "last_checkin": last_att.check_in_at.isoformat() if last_att else None,
                "today_checked_in": today_in,
            })
        return Response(res)


class TrainerMemberDetailView(APIView):
    """GET detailed profile and attendance log for one assigned member."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request, pk):
        profile = _get_trainer_profile_for_user(request.user)
        assignment = (
            TrainerAssignment.objects.filter(trainer=profile, member_id=pk, ended_at__isnull=True)
            .select_related("member__user")
            .first()
        )
        if not assignment:
            if getattr(request.user, "role", "") == "OWNER":
                m = MemberProfile.objects.select_related("user").filter(pk=pk).first()
                if not m:
                    return Response({"detail": "Member not found."}, status=404)
            else:
                return Response({"detail": "Member not assigned to you."}, status=404)
        else:
            m = assignment.member

        today = timezone.localdate()
        attendances = Attendance.objects.filter(member=m).select_related("recorded_by").order_by("-check_in_at")[:40]
        att_rows = [
            {
                "id": att.pk,
                "check_in_at": att.check_in_at.isoformat(),
                "check_in_date": att.check_in_date.isoformat(),
                "recorded_by": _name(att.recorded_by),
            }
            for att in attendances
        ]
        return Response({
            "id": m.pk,
            "user_id": m.user_id,
            "name": _name(m.user),
            "email": m.user.email,
            "phone": m.phone,
            "membership_status": m.membership_status,
            "is_active": m.is_active_on(today),
            "expiry_date": m.expiry_date.isoformat() if m.expiry_date else None,
            "date_joined": m.date_joined.isoformat() if m.date_joined else None,
            "assigned_at": assignment.assigned_at.isoformat() if assignment else None,
            "total_checkins": Attendance.objects.filter(member=m).count(),
            "attendances": att_rows,
        })


class TrainerDashboardView(APIView):
    """GET aggregate stats, today's check-ins, announcements, and notif count for trainer dashboard."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        profile = _get_trainer_profile_for_user(request.user)
        if profile is None:
            return Response({"detail": "Trainer profile not found."}, status=404)
        today = timezone.localdate()
        week_ago = today - timezone.timedelta(days=7)

        assignments = list(
            TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
            .select_related("member__user")
        )
        assigned_ids = [a.member_id for a in assignments]
        assigned_count = len(assigned_ids)
        max_members = profile.max_members or 20
        cap_pct = round((assigned_count / max_members) * 100) if max_members else 0

        active_count = 0
        expiring_soon_count = 0
        expired_count = 0
        for a in assignments:
            m = a.member
            if m.is_active_on(today):
                if m.expiry_date is not None and 0 <= (m.expiry_date - today).days <= 7:
                    expiring_soon_count += 1
                else:
                    active_count += 1
            else:
                expired_count += 1

        today_checkins = Attendance.objects.filter(member_id__in=assigned_ids, check_in_date=today).count()
        week_checkins = Attendance.objects.filter(member_id__in=assigned_ids, check_in_date__gte=week_ago).count()

        recent_att = (
            Attendance.objects.filter(member_id__in=assigned_ids)
            .select_related("member__user")
            .order_by("-check_in_at")[:12]
        )
        recent_list = [
            {
                "id": a.pk,
                "member_id": a.member_id,
                "member_name": _name(a.member.user),
                "check_in_at": a.check_in_at.isoformat(),
                "check_in_date": a.check_in_date.isoformat(),
            }
            for a in recent_att
        ]

        announcements = (
            Announcement.objects.filter(status=Announcement.Status.PUBLISHED)
            .order_by("-pinned", "-publish_on", "-id")[:4]
        )
        ann_list = [
            {
                "id": ann.pk,
                "title": ann.title,
                "message": ann.message,
                "publish_on": ann.publish_on.isoformat() if ann.publish_on else None,
                "pinned": ann.pinned,
            }
            for ann in announcements
        ]

        unread_count = Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()

        return Response({
            "trainer": {
                "id": profile.pk,
                "name": _name(profile.user),
                "specialization": profile.specialization,
                "bio": profile.bio,
                "availability": profile.availability,
            },
            "stats": {
                "assigned_members": assigned_count,
                "active_members": active_count,
                "expiring_soon_members": expiring_soon_count,
                "expired_members": expired_count,
                "max_members": max_members,
                "capacity_pct": min(100, cap_pct),
                "today_checkins": today_checkins,
                "week_checkins": week_checkins,
                "is_full": assigned_count >= max_members,
                "is_active": profile.is_active,
            },
            "recent_attendances": recent_list,
            "announcements": ann_list,
            "unread_notifications": unread_count,
        })


def _parse_iso_date(raw, default):
    if not raw:
        return default
    try:
        return timezone.datetime.fromisoformat(str(raw)).date()
    except (ValueError, TypeError):
        return default


def _month_end(year, month):
    if month == 12:
        return timezone.datetime.date(timezone.datetime(year, 12, 31))
    first_next = timezone.datetime(year, month + 1, 1).date()
    return first_next - timezone.timedelta(days=1)


def _build_attendance_series(request, assigned_ids):
    today = timezone.localdate()
    period = str(request.query_params.get("period") or "days").lower()
    if period not in ("days", "weeks", "months", "years"):
        period = "days"

    raw_member = request.query_params.get("member_id") or request.query_params.get("member") or "all"
    if str(raw_member).lower() not in ("all", ""):
        try:
            mid = int(raw_member)
        except (ValueError, TypeError):
            return Response({"detail": "Invalid member ID."}, status=400)
        if mid not in assigned_ids:
            return Response({"detail": "You can only query attendance for members assigned to you."}, status=403)
        target_ids = {mid}
        member_filter = mid
    else:
        target_ids = set(assigned_ids)
        member_filter = "all"

    if period == "weeks":
        default_from = today - timezone.timedelta(days=55)
    elif period == "months":
        y, m = today.year, today.month - 5
        while m <= 0:
            m += 12
            y -= 1
        default_from = timezone.datetime(y, m, 1).date()
    elif period == "years":
        default_from = timezone.datetime(today.year - 2, 1, 1).date()
    else:
        default_from = today - timezone.timedelta(days=13)

    from_date = _parse_iso_date(request.query_params.get("from"), default_from)
    to_date = _parse_iso_date(request.query_params.get("to"), today)
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    # Cap excessive date ranges to 3 years (1096 days) to keep serverless responses fast
    if (to_date - from_date).days > 1096:
        from_date = to_date - timezone.timedelta(days=1096)

    daily_counts = {}
    if target_ids:
        qs = Attendance.objects.filter(
            member_id__in=target_ids,
            check_in_date__gte=from_date,
            check_in_date__lte=to_date,
        ).values_list("check_in_date", flat=True)
        for d in qs:
            daily_counts[d] = daily_counts.get(d, 0) + 1

    n_targets = len(target_ids)

    def tally(d_start, d_end):
        c_total = 0
        s_total = 0
        cur = d_start
        one_day = timezone.timedelta(days=1)
        while cur <= d_end:
            c = daily_counts.get(cur, 0)
            c_total += c
            if cur <= today and n_targets > 0:
                s_total += max(c, n_targets)
            else:
                s_total += c
            cur += one_day
        missed = max(0, s_total - c_total)
        rate = round((c_total / s_total) * 100) if s_total > 0 else 0
        return c_total, s_total, missed, rate

    buckets = []
    if period == "days":
        cur = from_date
        one_day = timezone.timedelta(days=1)
        while cur <= to_date:
            c, s, missed, rate = tally(cur, cur)
            buckets.append({
                "key": cur.isoformat(),
                "label": f"{cur.strftime('%b')} {cur.day}",
                "tooltip_label": f"{cur.strftime('%b')} {cur.day}, {cur.year}",
                "checked_in": c,
                "scheduled": s,
                "missed": missed,
                "rate": rate,
            })
            cur += one_day
    elif period == "weeks":
        cur = from_date
        while cur <= to_date:
            w_end = min(to_date, cur + timezone.timedelta(days=6))
            c, s, missed, rate = tally(cur, w_end)
            buckets.append({
                "key": cur.isoformat(),
                "label": f"{cur.strftime('%b')} {cur.day}",
                "tooltip_label": f"{cur.strftime('%b')} {cur.day} – {w_end.strftime('%b')} {w_end.day}, {w_end.year}",
                "checked_in": c,
                "scheduled": s,
                "missed": missed,
                "rate": rate,
            })
            cur = w_end + timezone.timedelta(days=1)
    elif period == "months":
        y, m = from_date.year, from_date.month
        same_year = from_date.year == to_date.year
        while (y, m) <= (to_date.year, to_date.month):
            first_d = timezone.datetime(y, m, 1).date()
            last_d = _month_end(y, m)
            m_start = max(from_date, first_d)
            m_end = min(to_date, last_d)
            c, s, missed, rate = tally(m_start, m_end)
            buckets.append({
                "key": f"{y:04d}-{m:02d}",
                "label": first_d.strftime("%b") if same_year else first_d.strftime("%b '%y"),
                "tooltip_label": first_d.strftime("%B %Y"),
                "checked_in": c,
                "scheduled": s,
                "missed": missed,
                "rate": rate,
            })
            m += 1
            if m > 12:
                m = 1
                y += 1
    else:  # years
        for y in range(from_date.year, to_date.year + 1):
            y_start = max(from_date, timezone.datetime(y, 1, 1).date())
            y_end = min(to_date, timezone.datetime(y, 12, 31).date())
            c, s, missed, rate = tally(y_start, y_end)
            buckets.append({
                "key": str(y),
                "label": str(y),
                "tooltip_label": str(y),
                "checked_in": c,
                "scheduled": s,
                "missed": missed,
                "rate": rate,
            })

    total_checked_in = sum(b["checked_in"] for b in buckets)
    total_scheduled = sum(b["scheduled"] for b in buckets)
    total_missed = sum(b["missed"] for b in buckets)
    avg_rate = round((total_checked_in / total_scheduled) * 100) if total_scheduled > 0 else 0

    return Response({
        "period": period,
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "member_id": member_filter,
        "buckets": buckets,
        "summary": {
            "checked_in": total_checked_in,
            "scheduled": total_scheduled,
            "missed": total_missed,
            "rate": avg_rate,
        },
    })


class TrainerAttendanceListView(APIView):
    """GET check-in logs or aggregated attendance analytics for members assigned to this trainer."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        profile = _get_trainer_profile_for_user(request.user)
        assigned_ids = set(
            TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True).values_list("member_id", flat=True)
        ) if profile else set()

        if any(k in request.query_params for k in ("period", "from", "to", "member_id", "member")):
            return _build_attendance_series(request, assigned_ids)

        raw_date = request.query_params.get("date")
        try:
            day = timezone.datetime.fromisoformat(raw_date).date() if raw_date else timezone.localdate()
        except (ValueError, TypeError):
            day = timezone.localdate()

        qs = (
            Attendance.objects.filter(check_in_date=day, member_id__in=assigned_ids)
            .select_related("member__user", "recorded_by")
            .order_by("-check_in_at")
        )

        rows = [
            {
                "id": a.pk,
                "member_id": a.member_id,
                "member_name": _name(a.member.user),
                "member_phone": a.member.phone,
                "membership_status": a.member.membership_status,
                "is_my_member": True,
                "check_in_at": a.check_in_at.isoformat(),
                "check_in_date": a.check_in_date.isoformat(),
                "recorded_by": _name(a.recorded_by),
            }
            for a in qs
        ]
        return Response({
            "date": day.isoformat(),
            "total": len(rows),
            "my_members_count": len(rows),
            "attendances": rows,
        })


TIMETABLE_SESSIONS = [
    {"id": 1, "dow": 0, "day": "Sunday", "time": "09:00", "mins": 45, "name": "Recovery & Stretch", "coach": "Coach Bea", "cap": 18, "room": "Studio 1"},
    {"id": 2, "dow": 1, "day": "Monday", "time": "06:00", "mins": 45, "name": "Sunrise HIIT", "coach": "Coach Mika", "cap": 12, "room": "Main Floor"},
    {"id": 3, "dow": 1, "day": "Monday", "time": "18:30", "mins": 60, "name": "Strength Basics", "coach": "Coach Jun", "cap": 10, "room": "Weight Area"},
    {"id": 4, "dow": 2, "day": "Tuesday", "time": "07:00", "mins": 40, "name": "Cardio Club", "coach": "Coach Rei", "cap": 16, "room": "Cardio Deck"},
    {"id": 5, "dow": 2, "day": "Tuesday", "time": "19:00", "mins": 50, "name": "Boxing Fitness", "coach": "Coach Dan", "cap": 12, "room": "Studio 2"},
    {"id": 6, "dow": 3, "day": "Wednesday", "time": "06:00", "mins": 45, "name": "Sunrise HIIT", "coach": "Coach Mika", "cap": 12, "room": "Main Floor"},
    {"id": 7, "dow": 3, "day": "Wednesday", "time": "19:00", "mins": 50, "name": "Mobility Flow", "coach": "Coach Bea", "cap": 14, "room": "Studio 1"},
    {"id": 8, "dow": 4, "day": "Thursday", "time": "18:00", "mins": 60, "name": "Barbell Club", "coach": "Coach Jun", "cap": 8, "room": "Weight Area"},
    {"id": 9, "dow": 5, "day": "Friday", "time": "07:00", "mins": 40, "name": "Cardio Club", "coach": "Coach Rei", "cap": 16, "room": "Cardio Deck"},
    {"id": 10, "dow": 5, "day": "Friday", "time": "17:30", "mins": 45, "name": "Friday Finisher", "coach": "Coach Mika", "cap": 12, "room": "Main Floor"},
    {"id": 11, "dow": 6, "day": "Saturday", "time": "08:00", "mins": 75, "name": "Team Sweat", "coach": "Coaches", "cap": 20, "room": "Main Floor"},
]


class TrainerScheduleView(APIView):
    """GET weekly timetable sessions, and POST a schedule update note to all assigned members."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        profile = _get_trainer_profile_for_user(request.user)
        coach_name = _name(request.user)
        assigned_members = []
        if profile:
            assignments = (
                TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
                .select_related("member__user")
            )
            assigned_members = [{"id": a.member.pk, "name": _name(a.member.user)} for a in assignments]

        sessions = []
        for s in TIMETABLE_SESSIONS:
            item = dict(s)
            item["is_mine"] = (
                coach_name.lower() in s["coach"].lower() or
                s["coach"].lower() in coach_name.lower() or
                s["coach"] == "Coaches"
            )
            sessions.append(item)

        return Response({
            "coach_name": coach_name,
            "sessions": sessions,
            "assigned_members": assigned_members,
        })

    def post(self, request):
        note = str(request.data.get("note") or "").strip()
        session_name = str(request.data.get("session_name") or "Schedule Update").strip()
        if not note:
            return Response({"detail": "Note content is required."}, status=400)

        profile = _get_trainer_profile_for_user(request.user)
        if not profile:
            return Response({"detail": "Trainer profile not found."}, status=404)

        assignments = (
            TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
            .select_related("member__user")
        )
        member_users = [a.member.user for a in assignments]

        if member_users:
            notify_many(
                member_users,
                title=f"Schedule Update: {session_name}",
                kind=Notification.Kind.TRAINER,
                body=f"{_name(request.user)}: {note}",
                link="member-home.html#timetable",
            )
        return Response({
            "detail": f"Schedule update sent to {len(member_users)} assigned members.",
            "recipient_count": len(member_users),
        })
