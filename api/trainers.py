"""Trainer endpoints: the owner manages trainers and assignments; members pick or request one."""

import secrets
import string

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import connection, transaction
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.emails import send_invite_email
from apps.accounts.models import Role, StaffInvite
from apps.accounts.services import create_staff_invite, normalize_email
from apps.announcements.models import Announcement
from apps.membership.models import Attendance, MemberProfile
from apps.notifications.models import Notification
from apps.notifications.services import notify_many
from apps.trainers import services
from apps.trainers.models import TrainerAssignment, TrainerProfile, TrainerRequest


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


def _invite_status_for(user):
    if user.is_active:
        return "ACTIVE"
    now = timezone.now()
    latest = StaffInvite.objects.filter(email=normalize_email(user.email), role=Role.TRAINER).order_by("-created_at", "-id").first()
    if latest and latest.is_usable(now):
        return "INVITE_PENDING"
    if latest and latest.is_expired(now):
        return "INVITE_EXPIRED"
    return "INVITE_PENDING"


_PHONE_COL_CACHE = None


def _has_phone_column():
    global _PHONE_COL_CACHE
    if _PHONE_COL_CACHE is True:
        return True
    try:
        with connection.cursor() as cursor:
            cols = {c.name for c in connection.introspection.get_table_description(cursor, TrainerProfile._meta.db_table)}
        has_col = "phone" in cols
        if has_col:
            _PHONE_COL_CACHE = True
        return has_col
    except Exception:
        return True


def _trainer_qs():
    qs = TrainerProfile.objects.select_related("user")
    return qs if _has_phone_column() else qs.defer("phone")


def _trainer_json(t):
    load = services.load(t)
    return {
        "id": t.pk,
        "name": _name(t.user),
        "email": t.user.email,
        "phone": t.phone if _has_phone_column() else "",
        "specialization": t.specialization,
        "bio": t.bio,
        "availability": t.availability,
        "max_members": t.max_members,
        "load": load,
        "is_full": load >= t.max_members,
        "is_active": t.is_active,
        "invite_status": _invite_status_for(t.user),
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

def _generate_temp_password():
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    core = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%"),
    ] + [secrets.choice(alphabet) for _ in range(8)]
    secrets.SystemRandom().shuffle(core)
    return "".join(core)


def _split_full_name(full_name):
    parts = [p for p in str(full_name or "").strip().split() if p]
    if not parts:
        return "", ""
    return parts[0][:150], " ".join(parts[1:])[:150]


def _try_send_invite(request, invite, raw_token):
    accept_url = request.build_absolute_uri(
        reverse("accounts:accept_invite", kwargs={"invite_id": invite.pk, "token": raw_token})
    )
    backend = getattr(settings, "EMAIL_BACKEND", "")
    is_non_delivery = any(b in backend for b in ("console.", "locmem.", "dummy."))
    if is_non_delivery:
        return accept_url, False, "Email delivery is not configured on this server. Copy and share the invitation link below."
    try:
        send_invite_email(invite, raw_token, accept_url)
        return accept_url, True, "Invitation email sent to the trainer."
    except Exception:
        return accept_url, False, "Email delivery failed. Copy and share the invitation link below."


class StaffTrainerListView(APIView):
    """GET trainers with their workload. POST creates a trainer profile (and account if requested)."""

    permission_classes = [IsOwner]

    def get(self, request):
        rows = _trainer_qs()
        return Response([_trainer_json(t) for t in rows])

    def post(self, request):
        User = get_user_model()
        user_id = request.data.get("user_id")
        if user_id:
            user = User.objects.filter(pk=user_id, role="TRAINER").first()
            if user is None:
                return Response({"detail": "Pick a user whose role is Trainer."}, status=400)
            if TrainerProfile.objects.filter(user=user).exists():
                return Response({"detail": "This trainer already has a profile."}, status=400)
            profile = TrainerProfile.objects.create(user=user, **_profile_fields(request.data, creating=True))
            return Response(_trainer_json(profile), status=201)

        full_name = str(request.data.get("full_name") or "").strip()
        raw_email = str(request.data.get("email") or "").strip()
        access_mode = str(request.data.get("access_mode") or "invite").strip()
        if not full_name:
            return Response({"detail": "Full name is required."}, status=400)
        if not raw_email:
            return Response({"detail": "Email address is required."}, status=400)
        try:
            validate_email(raw_email)
        except DjangoValidationError:
            return Response({"detail": "Enter a valid email address."}, status=400)
        if access_mode not in ("invite", "temp_password"):
            return Response({"detail": "Invalid account access mode."}, status=400)

        email = normalize_email(raw_email)
        if User.objects.filter(Q(username__iexact=email) | Q(email__iexact=email)).exists():
            return Response({"detail": "An account with this email address already exists."}, status=400)

        fields = _profile_fields(request.data, creating=True)
        first_name, last_name = _split_full_name(full_name)

        if access_mode == "temp_password":
            temp_password = str(request.data.get("temp_password") or "").strip() or _generate_temp_password()
            with transaction.atomic():
                user = User(
                    username=email,
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    role=Role.TRAINER,
                    is_active=True,
                    must_change_password=True,
                )
                try:
                    validate_password(temp_password, user)
                except DjangoValidationError as exc:
                    return Response({"detail": " ".join(exc.messages)}, status=400)
                user.set_password(temp_password)
                user.save()
                profile = TrainerProfile.objects.create(user=user, **fields)
            payload = _trainer_json(profile)
            payload.update({
                "access_mode": "temp_password",
                "temp_password": temp_password,
                "must_change_password": True,
            })
            return Response(payload, status=201)

        with transaction.atomic():
            user = User(
                username=email,
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=Role.TRAINER,
                is_active=False,
            )
            user.set_unusable_password()
            user.save()
            profile = TrainerProfile.objects.create(user=user, **fields)
            invite, raw_token = create_staff_invite(owner=request.user, email=email, role=Role.TRAINER)

        accept_url, email_sent, email_note = _try_send_invite(request, invite, raw_token)
        payload = _trainer_json(profile)
        payload.update({
            "access_mode": "invite",
            "invite_url": accept_url,
            "invite_expires_hours": 72,
            "email_sent": email_sent,
            "email_status_note": email_note,
        })
        return Response(payload, status=201)


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
        profile = _trainer_qs().filter(pk=pk).first()
        if profile is None:
            return Response({"detail": "Trainer not found."}, status=404)
        fields = _profile_fields(request.data, creating=False)
        for key, value in fields.items():
            setattr(profile, key, value)
        if fields:
            profile.save(update_fields=list(fields.keys()))
        return Response(_trainer_json(profile))


class StaffTrainerResendInviteView(APIView):
    """Issue a fresh 72-hour invite link for a trainer whose account is still pending."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        profile = TrainerProfile.objects.select_related("user").filter(pk=pk).first()
        if profile is None:
            return Response({"detail": "Trainer not found."}, status=404)
        if profile.user.is_active:
            return Response({"detail": "This trainer account is already active."}, status=400)
        now = timezone.now()
        email = normalize_email(profile.user.email)
        StaffInvite.objects.filter(email=email, role=Role.TRAINER, used_at__isnull=True, expires_at__gt=now).update(expires_at=now)
        invite, raw_token = create_staff_invite(owner=request.user, email=email, role=Role.TRAINER)
        accept_url, email_sent, email_note = _try_send_invite(request, invite, raw_token)
        return Response({
            "detail": email_note,
            "invite_url": accept_url,
            "invite_expires_hours": 72,
            "email_sent": email_sent,
            "email_status_note": email_note,
            "trainer": _trainer_json(profile),
        })


def _profile_fields(data, *, creating):
    fields = {}
    allowed_keys = ("specialization", "bio", "availability", "phone") if _has_phone_column() else ("specialization", "bio", "availability")
    for key in allowed_keys:
        if key in data:
            max_len = 500 if key == "bio" else (40 if key == "phone" else 160)
            fields[key] = str(data.get(key) or "")[:max_len]
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
            Announcement.objects.filter(
                status=Announcement.Status.PUBLISHED,
                audience__in=["ALL", "everyone", "EVERYONE", "trainers", "TRAINERS"],
            )
            .filter(Q(publish_on__isnull=True) | Q(publish_on__lte=today))
            .order_by("-pinned", "-publish_on", "-id")[:4]
        )
        ann_list = [
            {
                "id": ann.pk,
                "title": ann.title,
                "body": ann.message,
                "message": ann.message,
                "audience": "trainers" if str(ann.audience).lower() == "trainers" else "everyone",
                "event_date": ann.event_date.isoformat() if ann.event_date else None,
                "publish_on": ann.publish_on.isoformat() if ann.publish_on else None,
                "published_at": ann.published_at.isoformat() if ann.published_at else None,
                "pinned": ann.pinned,
            }
            for ann in announcements
        ]

        unread_count = Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()
        assigned_members_list = [
            {"id": a.member_id, "name": _name(a.member.user)}
            for a in assignments
        ]

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
            "assigned_members": assigned_members_list,
            "recent_attendances": recent_list,
            "announcements": ann_list,
            "unread_notifications": unread_count,
        })


def _build_attendance_series(request, assigned_ids, assigned_members):
    granularity_raw = request.query_params.get("granularity") or request.query_params.get("period") or "day"
    from_raw = request.query_params.get("from")
    to_raw = request.query_params.get("to")
    member_raw = request.query_params.get("member_id") or request.query_params.get("member") or "all"

    status_code, payload = services.build_trainer_attendance_series(
        assigned_ids=assigned_ids,
        assigned_members=assigned_members,
        granularity_raw=granularity_raw,
        from_raw=from_raw,
        to_raw=to_raw,
        member_raw=member_raw,
    )
    return Response(payload, status=status_code)


class TrainerAttendanceListView(APIView):
    """GET check-in logs or aggregated attendance analytics for members assigned to this trainer."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        profile = _get_trainer_profile_for_user(request.user)
        assigned_ids, assigned_members = services.get_trainer_assigned_members(profile)

        if any(k in request.query_params for k in ("granularity", "period", "from", "to", "member_id", "member")):
            return _build_attendance_series(request, assigned_ids, assigned_members)

        raw_date = request.query_params.get("date")
        try:
            day = timezone.datetime.fromisoformat(raw_date).date() if raw_date else timezone.localdate()
        except (ValueError, TypeError):
            day = timezone.localdate()

        filter_mode = str(request.query_params.get("filter") or "all").strip().lower()
        if filter_mode == "mine":
            qs = Attendance.objects.filter(check_in_date=day, member_id__in=assigned_ids)
        else:
            qs = Attendance.objects.filter(check_in_date=day)

        qs = qs.select_related("member__user", "recorded_by").order_by("-check_in_at")

        total_day_count = Attendance.objects.filter(check_in_date=day).count()
        my_day_count = Attendance.objects.filter(check_in_date=day, member_id__in=assigned_ids).count()

        rows = [
            {
                "id": a.pk,
                "member_id": a.member_id,
                "member_name": _name(a.member.user),
                "member_phone": a.member.phone,
                "membership_status": a.member.membership_status,
                "is_my_member": a.member_id in assigned_ids,
                "check_in_at": a.check_in_at.isoformat(),
                "check_in_date": a.check_in_date.isoformat(),
                "recorded_by": _name(a.recorded_by),
            }
            for a in qs
        ]
        return Response({
            "date": day.isoformat(),
            "total": total_day_count,
            "my_members_count": my_day_count,
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
