"""Trainer endpoints: the owner manages trainers and assignments; members pick or request one."""

import re
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
from apps.membership.services import check_in_member, validate_full_name
from apps.notifications.models import Notification
from apps.notifications.services import (
    clear_notifications,
    delete_notification,
    mark_all_read,
    mark_read,
    notify,
    notify_many,
    unread_count,
)
from .notifications import build_notification_payload
from .permissions import MemberAccess
from apps.trainers import services
from apps.trainers.models import TrainerAssignment, TrainerProfile, TrainerRequest, TrainerSession


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_active", False)
            and getattr(user, "role", "") == "OWNER"
        )


class IsMember(BasePermission):
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_active", False)
            and getattr(user, "role", "") == "MEMBER"
        )


def _effective_trainer_user(request):
    """Return the authenticated request user (never impersonates an anonymous caller)."""
    return getattr(request, "user", None)


class IsTrainerOrOwner(BasePermission):
    """Permits access to active users with role TRAINER or OWNER."""

    def has_permission(self, request, view):
        user = _effective_trainer_user(request)
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and getattr(user, "is_active", False)
            and getattr(user, "role", "") in ("TRAINER", "OWNER")
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
    if latest and latest.used_at is None:
        if latest.is_usable(now):
            return "INVITE_PENDING"
        if latest.is_expired(now):
            return "INVITE_EXPIRED"
    return "DEACTIVATED"


def _has_phone_column():
    return services.has_trainer_phone_column()


def _has_status_column():
    return services.has_trainer_status_column()


def _has_session_table():
    return services.has_trainer_session_table()


def _trainer_qs():
    return services.defer_missing_trainer_fields(TrainerProfile.objects.select_related("user"))


def _trainer_status_value(t):
    if _has_status_column():
        raw = str(getattr(t, "status", "") or "").strip().lower()
        if raw in (TrainerProfile.Status.ACTIVE, TrainerProfile.Status.ON_LEAVE, TrainerProfile.Status.INACTIVE):
            if raw == TrainerProfile.Status.ACTIVE and not t.is_active:
                return TrainerProfile.Status.INACTIVE
            return raw
    return TrainerProfile.Status.ACTIVE if t.is_active else TrainerProfile.Status.INACTIVE


def _trainer_json(t):
    load = services.load(t)
    status_val = _trainer_status_value(t)
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
        "account_active": bool(t.user.is_active),
        "status": status_val,
        "on_leave": status_val == TrainerProfile.Status.ON_LEAVE,
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
        if not (_has_phone_column() and _has_status_column()):
            return Response(
                {"detail": "Database migration pending. Please run python manage.py migrate first."},
                status=503,
            )
        User = get_user_model()
        user_id = request.data.get("user_id")
        if user_id:
            user = User.objects.filter(pk=user_id, role="TRAINER").first()
            if user is None:
                return Response({"detail": "Pick a user whose role is Trainer."}, status=400)
            if _trainer_qs().filter(user=user).exists():
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
        data = request.data if isinstance(request.data, dict) else {}
        fields = _profile_fields(data, creating=False)
        with transaction.atomic():
            if "account_active" in data:
                next_acc = bool(data.get("account_active"))
                if profile.user.is_active != next_acc:
                    profile.user.is_active = next_acc
                    profile.user.save(update_fields=["is_active"])
                if not next_acc:
                    if profile.user.email:
                        StaffInvite.objects.filter(
                            email__iexact=profile.user.email,
                            role=Role.TRAINER,
                            used_at__isnull=True,
                        ).update(used_at=timezone.now())
                    fields["is_active"] = False
                    if _has_status_column():
                        fields["status"] = TrainerProfile.Status.INACTIVE
                elif "status" not in data and "is_active" not in data:
                    fields["is_active"] = True
                    if _has_status_column():
                        fields["status"] = TrainerProfile.Status.ACTIVE
            for key, value in fields.items():
                setattr(profile, key, value)
            if fields:
                profile.save(update_fields=list(fields.keys()))
        return Response(_trainer_json(profile))


class StaffTrainerResendInviteView(APIView):
    """Issue a fresh 72-hour invite link for a trainer whose account is still pending."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        profile = _trainer_qs().filter(pk=pk).first()
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
    valid_statuses = (
        TrainerProfile.Status.ACTIVE,
        TrainerProfile.Status.ON_LEAVE,
        TrainerProfile.Status.INACTIVE,
    )
    if "status" in data:
        raw_status = str(data.get("status") or "").strip().lower()
        if raw_status not in valid_statuses:
            raise ValidationError({"detail": "Status must be active, on_leave, or inactive."})
        if raw_status == TrainerProfile.Status.ON_LEAVE and not _has_status_column():
            raise ValidationError({"detail": "Run python manage.py migrate to enable On Leave status."})
        fields["is_active"] = raw_status == TrainerProfile.Status.ACTIVE
        if _has_status_column():
            fields["status"] = raw_status
    elif "is_active" in data:
        active = bool(data.get("is_active"))
        fields["is_active"] = active
        if _has_status_column():
            fields["status"] = TrainerProfile.Status.ACTIVE if active else TrainerProfile.Status.INACTIVE
    elif creating:
        fields["is_active"] = True
        if _has_status_column():
            fields["status"] = TrainerProfile.Status.ACTIVE
    return fields


class StaffMemberTrainerView(APIView):
    """POST {"trainer_id": n} assigns or changes a member's trainer. Confirmation is on the page."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        member = MemberProfile.objects.select_related("user").filter(pk=pk).first()
        trainer = _trainer_qs().filter(pk=request.data.get("trainer_id")).first()
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
        rows = services.defer_missing_trainer_fields(
            TrainerRequest.objects.select_related("member__user", "trainer__user"),
            prefix="trainer__",
        )
        status = request.query_params.get("status", "PENDING")
        if status:
            rows = rows.filter(status=status)
        return Response([_request_json(r) for r in rows[:100]])


class StaffTrainerRequestDecideView(APIView):
    """POST {"approve": true, "trainer_id": n?} or {"approve": false}."""

    permission_classes = [IsOwner]

    def post(self, request, pk):
        req = (
            services.defer_missing_trainer_fields(
                TrainerRequest.objects.select_related("member__user", "trainer__user"),
                prefix="trainer__",
            )
            .filter(pk=pk)
            .first()
        )
        if req is None:
            return Response({"detail": "Request not found."}, status=404)
        trainer = None
        if request.data.get("trainer_id"):
            trainer = _trainer_qs().filter(pk=request.data.get("trainer_id")).first()
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

    permission_classes = [IsMember, MemberAccess]

    def get(self, request):
        profile = _member_profile(request.user)
        if profile is None:
            return Response({"detail": "No membership profile found."}, status=404)
        current = services.current_assignment(profile)
        pending = TrainerRequest.objects.filter(member=profile, status=TrainerRequest.Status.PENDING).first()
        options = [_trainer_json(t) for t in _trainer_qs().filter(is_active=True)]
        return Response({
            "trainer": _trainer_json(current.trainer) if current else None,
            "pending_request": _request_json(pending) if pending else None,
            "options": options,
        })


class MemberTrainerRequestView(APIView):
    """POST {"trainer_id": n?, "note": "..."} asks for a trainer. The owner decides."""

    permission_classes = [IsMember, MemberAccess]

    def post(self, request):
        profile = _member_profile(request.user)
        if profile is None:
            return Response({"detail": "No membership profile found."}, status=404)
        trainer = None
        if request.data.get("trainer_id"):
            trainer = _trainer_qs().filter(pk=request.data.get("trainer_id")).first()
            if trainer is None:
                return Response({"detail": "Trainer not found."}, status=404)
        try:
            req = services.request_trainer(profile, trainer=trainer, note=str(request.data.get("note") or ""))
        except DjangoValidationError as exc:
            _fail(exc)
        return Response(_request_json(req), status=201)


class MemberTrainerRequestCancelView(APIView):
    permission_classes = [IsMember, MemberAccess]

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
        profile = _trainer_qs().filter(user=user).first()
        if profile is not None:
            return profile
        if _has_phone_column() and _has_status_column():
            profile, _ = TrainerProfile.objects.get_or_create(
                user=user,
                defaults={
                    "specialization": "Functional Training & Conditioning",
                    "max_members": 20,
                    "is_active": True,
                },
            )
            return profile
        return None
    elif getattr(user, "role", "") == "OWNER":
        profile = _trainer_qs().filter(user=user).first()
        if not profile:
            profile = _trainer_qs().first()
        return profile
    return None


class TrainerProfileView(APIView):
    """GET/PATCH the logged-in trainer's own profile and settings."""

    permission_classes = [IsTrainerOrOwner]

    def _serialize(self, profile, user):
        load = services.load(profile)
        today = timezone.localdate()
        assignments = list(
            TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
            .select_related("member")
        )
        assigned_ids = [a.member_id for a in assignments]
        active_members = sum(1 for a in assignments if a.member.is_active_on(today))
        today_checkins = (
            Attendance.objects.filter(member_id__in=assigned_ids, check_in_date=today).count()
            if assigned_ids else 0
        )
        unread_notifs = Notification.objects.filter(recipient=user, read_at__isnull=True).count()
        status_val = _trainer_status_value(profile)
        return {
            "id": profile.pk,
            "user_id": profile.user_id,
            "name": _name(profile.user),
            "first_name": profile.user.first_name,
            "last_name": profile.user.last_name,
            "email": profile.user.email,
            "username": profile.user.username,
            "photo": getattr(profile.user, "avatar_data", "") or "",
            "phone": (profile.phone if _has_phone_column() else "") or "",
            "specialization": profile.specialization,
            "bio": profile.bio,
            "availability": profile.availability,
            "max_members": profile.max_members,
            "load": load,
            "active_members": active_members,
            "today_checkins": today_checkins,
            "unread_notifications": unread_notifs,
            "is_full": load >= profile.max_members,
            "is_active": profile.is_active,
            "status": status_val,
            "on_leave": status_val == TrainerProfile.Status.ON_LEAVE,
            "created_at": profile.created_at,
        }

    def get(self, request):
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
        if profile is None:
            return Response({"detail": "Trainer profile not found."}, status=404)
        return Response(self._serialize(profile, user))

    def patch(self, request):
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
        if profile is None:
            return Response({"detail": "Trainer profile not found."}, status=404)
        data = request.data
        update_fields = []
        raw_name = data.get("full_name") if "full_name" in data else data.get("name")
        if raw_name is not None:
            try:
                first_name, last_name = validate_full_name(raw_name)
            except DjangoValidationError as exc:
                return Response({"detail": exc.messages[0]}, status=400)
            profile.user.first_name = first_name[:150]
            profile.user.last_name = last_name[:150]
            profile.user.save(update_fields=["first_name", "last_name"])
        if "specialization" in data:
            profile.specialization = str(data["specialization"] or "")[:120]
            update_fields.append("specialization")
        if "bio" in data:
            profile.bio = str(data["bio"] or "")[:500]
            update_fields.append("bio")
        if "availability" in data:
            profile.availability = str(data["availability"] or "")[:160]
            update_fields.append("availability")
        if "phone" in data and _has_phone_column():
            profile.phone = str(data["phone"] or "")[:40]
            update_fields.append("phone")
        if "status" in data:
            raw_status = str(data.get("status") or "").strip().lower()
            if raw_status not in (
                TrainerProfile.Status.ACTIVE,
                TrainerProfile.Status.ON_LEAVE,
                TrainerProfile.Status.INACTIVE,
            ):
                return Response({"detail": "Status must be active, on_leave, or inactive."}, status=400)
            if raw_status == TrainerProfile.Status.ON_LEAVE and not _has_status_column():
                return Response({"detail": "Run python manage.py migrate to enable On Leave status."}, status=400)
            profile.is_active = raw_status == TrainerProfile.Status.ACTIVE
            update_fields.append("is_active")
            if _has_status_column():
                profile.status = raw_status
                update_fields.append("status")
        elif "is_active" in data:
            active = bool(data["is_active"])
            profile.is_active = active
            update_fields.append("is_active")
            if _has_status_column():
                profile.status = TrainerProfile.Status.ACTIVE if active else TrainerProfile.Status.INACTIVE
                update_fields.append("status")
        if "photo" in data:
            photo = data.get("photo")
            if photo is None:
                photo = ""
            if not isinstance(photo, str):
                return Response({"detail": "Invalid profile photo format."}, status=400)
            photo = photo.strip()
            allowed_presets = {"av-1", "av-2", "av-3", "av-4", "av-5", "av-6"}
            if photo and photo not in allowed_presets:
                if not photo.startswith("data:image/"):
                    return Response({"detail": "Profile photo must be an image."}, status=400)
                if len(photo) > 1_350_000:
                    return Response({"detail": "That photo is too large. Please pick one under 900 KB."}, status=400)
            profile.user.avatar_data = photo
            profile.user.save(update_fields=["avatar_data"])
        if update_fields:
            profile.save(update_fields=list(dict.fromkeys(update_fields)))
        payload = self._serialize(profile, user)
        payload["detail"] = "Profile updated successfully."
        return Response(payload)


class TrainerMembersView(APIView):
    """GET members currently assigned to the logged-in trainer."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
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
            is_act = m.is_active_on(today)
            days_rem = (m.expiry_date - today).days if m.expiry_date else None
            expiring_soon = bool(is_act and days_rem is not None and 0 <= days_rem <= 7)
            res.append({
                "id": m.pk,
                "user_id": m.user_id,
                "name": _name(m.user),
                "email": m.user.email,
                "phone": m.phone,
                "address": getattr(m, "address", ""),
                "membership_status": m.membership_status,
                "is_active": is_act,
                "days_remaining": days_rem,
                "expiring_soon": expiring_soon,
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
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
        assignment = (
            TrainerAssignment.objects.filter(trainer=profile, member_id=pk, ended_at__isnull=True)
            .select_related("member__user")
            .first()
        )
        if not assignment:
            if getattr(user, "role", "") == "OWNER":
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
        is_act = m.is_active_on(today)
        days_rem = (m.expiry_date - today).days if m.expiry_date else None
        return Response({
            "id": m.pk,
            "user_id": m.user_id,
            "name": _name(m.user),
            "email": m.user.email,
            "phone": m.phone,
            "address": getattr(m, "address", ""),
            "membership_status": m.membership_status,
            "is_active": is_act,
            "days_remaining": days_rem,
            "expiring_soon": bool(is_act and days_rem is not None and 0 <= days_rem <= 7),
            "expiry_date": m.expiry_date.isoformat() if m.expiry_date else None,
            "date_joined": m.date_joined.isoformat() if m.date_joined else None,
            "assigned_at": assignment.assigned_at.isoformat() if assignment else None,
            "total_checkins": Attendance.objects.filter(member=m).count(),
            "today_checked_in": Attendance.objects.filter(member=m, check_in_date=today).exists(),
            "attendances": att_rows,
        })


class TrainerDashboardView(APIView):
    """GET aggregate stats, today's check-ins, announcements, and notif count for trainer dashboard."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
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

        unread_count = Notification.objects.filter(recipient=user, read_at__isnull=True).count()
        assigned_members_list = [
            {"id": a.member_id, "name": _name(a.member.user)}
            for a in assignments
        ]

        today_dow = (today.weekday() + 1) % 7
        today_db_sessions = (
            list(
                services.defer_missing_trainer_fields(
                    TrainerSession.objects.filter(is_active=True, day_of_week=today_dow)
                    .select_related("trainer__user")
                    .order_by("start_time", "id"),
                    prefix="trainer__",
                )
            )
            if _has_session_table()
            else []
        )
        today_sessions_list = [_session_json(s, my_trainer_id=profile.pk) for s in today_db_sessions]
        my_today_classes = sum(1 for s in today_sessions_list if s["is_mine"])

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
                "today_my_classes": my_today_classes,
                "today_all_classes": len(today_sessions_list),
                "is_full": assigned_count >= max_members,
                "is_active": profile.is_active,
            },
            "assigned_members": assigned_members_list,
            "today_sessions": today_sessions_list,
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
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
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

        all_day_rows = list(Attendance.objects.filter(check_in_date=day))
        total_day_count = len(all_day_rows)
        my_day_count = sum(1 for a in all_day_rows if a.member_id in assigned_ids)
        morning_count = 0
        evening_count = 0
        for a in all_day_rows:
            local_dt = timezone.localtime(a.check_in_at)
            if local_dt.hour < 12:
                morning_count += 1
            else:
                evening_count += 1

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
            "morning_count": morning_count,
            "evening_count": evening_count,
            "assigned_members": assigned_members,
            "attendances": rows,
        })


class TrainerCheckInView(APIView):
    """POST /api/trainer/attendance/check-in/ with {"member_id": n} or {"qr_code": "PROFIT:M202601"}."""

    permission_classes = [IsTrainerOrOwner]

    @staticmethod
    def _resolve_member_id(data):
        raw_id = data.get("member_id")
        if raw_id is not None and str(raw_id).strip() != "":
            try:
                val = int(raw_id)
                return val if val > 0 else None
            except (TypeError, ValueError):
                return None

        raw_qr = str(data.get("qr_code") or data.get("member_code") or "").strip()
        if not raw_qr:
            return None
        cleaned = re.sub(r"^PROFIT:", "", raw_qr, flags=re.IGNORECASE).strip()
        match = re.match(r"^M(\d+)$", cleaned, flags=re.IGNORECASE)
        if not match:
            return None
        pk = int(match.group(1)) - 202600
        return pk if pk > 0 else None

    def post(self, request):
        user = _effective_trainer_user(request)
        member_id = self._resolve_member_id(request.data)
        if member_id is None:
            return Response({"detail": "Valid member_id or QR code is required."}, status=400)

        member = MemberProfile.objects.select_related("user").filter(pk=member_id).first()
        if member is None:
            return Response({"detail": "Member not found."}, status=404)
        try:
            record = check_in_member(member, recorded_by=user)
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)

        notify(
            user,
            f"Attendance logged: {_name(member.user)}",
            kind=Notification.Kind.TRAINER,
            body=f"{_name(member.user)} checked in on {record.check_in_date.isoformat()}.",
            link="/trainer/attendance",
        )

        return Response({
            "id": record.pk,
            "member_id": member.pk,
            "member_name": _name(member.user),
            "check_in_at": record.check_in_at.isoformat(),
            "check_in_date": record.check_in_date.isoformat(),
            "recorded_by": _name(user),
            "detail": f"{_name(member.user)} checked in successfully.",
        })


class TrainerAnnouncementsView(APIView):
    """GET /api/trainer/announcements/ -> published announcements visible to trainers with stats."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        today = timezone.localdate()
        qs = (
            Announcement.objects.filter(
                status=Announcement.Status.PUBLISHED,
                audience__in=["ALL", "everyone", "EVERYONE", "trainers", "TRAINERS"],
            )
            .filter(Q(publish_on__isnull=True) | Q(publish_on__lte=today))
            .order_by("-pinned", "-publish_on", "-id")
        )
        all_rows = list(qs)
        total_count = len(all_rows)
        pinned_count = sum(1 for a in all_rows if a.pinned)
        trainers_only_count = sum(1 for a in all_rows if str(a.audience).lower() == "trainers")
        upcoming_events_count = sum(
            1 for a in all_rows if getattr(a, "event_date", None) and a.event_date >= today
        )

        items = [
            {
                "id": ann.pk,
                "title": ann.title,
                "body": ann.message,
                "message": ann.message,
                "audience": "trainers" if str(ann.audience).lower() == "trainers" else "everyone",
                "event_date": ann.event_date.isoformat() if getattr(ann, "event_date", None) else None,
                "publish_on": ann.publish_on.isoformat() if ann.publish_on else None,
                "published_at": ann.published_at.isoformat() if ann.published_at else None,
                "created_at": ann.created_at.isoformat() if ann.created_at else None,
                "pinned": ann.pinned,
            }
            for ann in all_rows
        ]
        return Response({
            "items": items,
            "stats": {
                "total": total_count,
                "pinned": pinned_count,
                "trainers_only": trainers_only_count,
                "upcoming_events": upcoming_events_count,
            },
        })


DAY_NAMES = ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _session_json(session, *, my_trainer_id=None):
    return {
        "id": session.pk,
        "trainer_id": session.trainer_id,
        "dow": session.day_of_week,
        "day": DAY_NAMES[session.day_of_week] if 0 <= session.day_of_week <= 6 else "",
        "time": session.start_time,
        "mins": session.duration_mins,
        "name": session.name,
        "coach": _name(session.trainer.user),
        "cap": session.capacity,
        "room": session.room or "Main Floor",
        "notes": session.notes or "",
        "is_mine": bool(my_trainer_id is not None and session.trainer_id == my_trainer_id),
    }


def _validate_session_payload(data, *, partial=False):
    fields = {}
    if not partial or "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValidationError({"detail": "Session name is required."})
        fields["name"] = name[:120]

    has_dow = "day_of_week" in data or "dow" in data
    if not partial or has_dow:
        raw_dow = data.get("day_of_week") if "day_of_week" in data else data.get("dow")
        try:
            dow = int(raw_dow)
        except (TypeError, ValueError):
            dow = -1
        if not 0 <= dow <= 6:
            raise ValidationError({"detail": "Pick a valid day of the week (Sunday to Saturday)."})
        fields["day_of_week"] = dow

    has_time = "start_time" in data or "time" in data
    if not partial or has_time:
        raw_time = str(
            (data.get("start_time") if "start_time" in data else data.get("time")) or ""
        ).strip()
        if not _TIME_RE.match(raw_time):
            raise ValidationError({"detail": "Start time must be in 24-hour HH:MM format (e.g. 06:30)."})
        fields["start_time"] = raw_time

    has_mins = "duration_mins" in data or "mins" in data
    if has_mins or not partial:
        raw_mins = (
            data.get("duration_mins")
            if "duration_mins" in data
            else data.get("mins", 45)
        )
        try:
            mins = int(raw_mins)
        except (TypeError, ValueError):
            mins = -1
        if not 15 <= mins <= 240:
            raise ValidationError({"detail": "Duration must be between 15 and 240 minutes."})
        fields["duration_mins"] = mins

    has_cap = "capacity" in data or "cap" in data
    if has_cap or not partial:
        raw_cap = (
            data.get("capacity")
            if "capacity" in data
            else data.get("cap", 12)
        )
        try:
            cap = int(raw_cap)
        except (TypeError, ValueError):
            cap = -1
        if not 1 <= cap <= 100:
            raise ValidationError({"detail": "Capacity must be between 1 and 100 athletes."})
        fields["capacity"] = cap

    if "room" in data or not partial:
        room = str(data.get("room") or "Main Floor").strip() or "Main Floor"
        fields["room"] = room[:80]

    if "notes" in data or not partial:
        fields["notes"] = str(data.get("notes") or "").strip()[:300]

    return fields


class TrainerScheduleView(APIView):
    """GET database-backed weekly sessions, and POST a schedule update note to assigned members."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
        coach_name = _name(profile.user) if profile else _name(user)
        today = timezone.localdate()
        assigned_members = []
        if profile:
            assignments = (
                TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
                .select_related("member__user")
                .order_by("-assigned_at")
            )
            for a in assignments:
                m = a.member
                today_in = Attendance.objects.filter(member=m, check_in_date=today).exists()
                assigned_members.append({
                    "id": m.pk,
                    "name": _name(m.user),
                    "email": m.user.email,
                    "membership_status": m.membership_status,
                    "is_active": m.is_active_on(today),
                    "today_checked_in": today_in,
                })

        my_trainer_id = profile.pk if profile else None
        db_sessions = (
            services.defer_missing_trainer_fields(
                TrainerSession.objects.filter(is_active=True)
                .select_related("trainer__user")
                .order_by("day_of_week", "start_time", "id"),
                prefix="trainer__",
            )
            if _has_session_table()
            else []
        )
        sessions = [_session_json(s, my_trainer_id=my_trainer_id) for s in db_sessions]

        my_sessions_count = sum(1 for s in sessions if s["is_mine"])
        # Convert Python weekday (Mon=0..Sun=6) to JS dow (Sun=0..Sat=6)
        today_dow = (today.weekday() + 1) % 7
        today_all_count = sum(1 for s in sessions if s["dow"] == today_dow)
        today_my_count = sum(1 for s in sessions if s["dow"] == today_dow and s["is_mine"])

        return Response({
            "coach_name": coach_name,
            "availability": profile.availability if profile else "",
            "specialization": profile.specialization if profile else "",
            "sessions": sessions,
            "assigned_members": assigned_members,
            "stats": {
                "total_weekly_sessions": len(sessions),
                "my_weekly_sessions": my_sessions_count,
                "today_sessions_count": today_my_count,
                "today_all_sessions_count": today_all_count,
                "assigned_count": len(assigned_members),
            },
        })

    def post(self, request):
        user = _effective_trainer_user(request)
        note = str(request.data.get("note") or "").strip()
        session_name = str(request.data.get("session_name") or "Schedule Update").strip()[:120]
        raw_member_id = request.data.get("member_id")
        if not note:
            return Response({"detail": "Note content is required."}, status=400)
        if len(note) > 500:
            return Response({"detail": "Note must be 500 characters or fewer."}, status=400)

        profile = _get_trainer_profile_for_user(user)
        if not profile:
            return Response({"detail": "Trainer profile not found."}, status=404)

        assignments = (
            TrainerAssignment.objects.filter(trainer=profile, ended_at__isnull=True)
            .select_related("member__user")
        )
        if raw_member_id and str(raw_member_id).lower() != "all":
            try:
                target_id = int(raw_member_id)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid member_id."}, status=400)
            assignments = assignments.filter(member_id=target_id)
            if not assignments.exists():
                return Response({"detail": "That member is not assigned to you."}, status=403)

        member_users = [a.member.user for a in assignments]
        coach_label = _name(profile.user)

        if member_users:
            notify_many(
                member_users,
                title=f"Schedule Update: {session_name}",
                kind=Notification.Kind.TRAINER,
                body=f"{coach_label}: {note}",
                link="/member-home",
            )
        notify(
            user,
            title=f"Schedule update sent: {session_name}",
            kind=Notification.Kind.TRAINER,
            body=f"Broadcast delivered to {len(member_users)} athlete{'s' if len(member_users) != 1 else ''}: {note[:140]}",
            link="/trainer/schedule",
        )
        return Response({
            "detail": f"Schedule update sent to {len(member_users)} athlete{'s' if len(member_users) != 1 else ''}.",
            "recipient_count": len(member_users),
            "session_name": session_name,
            "note": note,
            "sent_at": timezone.now().isoformat(),
        })


class TrainerSessionListCreateView(APIView):
    """GET all active sessions; POST creates a coaching session owned by the signed-in trainer."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
        my_id = profile.pk if profile else None
        if not _has_session_table():
            return Response({"items": []})
        rows = services.defer_missing_trainer_fields(
            TrainerSession.objects.filter(is_active=True)
            .select_related("trainer__user")
            .order_by("day_of_week", "start_time", "id"),
            prefix="trainer__",
        )
        return Response({"items": [_session_json(s, my_trainer_id=my_id) for s in rows]})

    def post(self, request):
        if not _has_session_table():
            return Response({"detail": "Run python manage.py migrate to enable scheduled sessions."}, status=503)
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
        if profile is None:
            return Response({"detail": "Trainer profile not found."}, status=404)
        fields = _validate_session_payload(request.data or {}, partial=False)
        session = TrainerSession.objects.create(trainer=profile, **fields)
        return Response(_session_json(session, my_trainer_id=profile.pk), status=201)


class TrainerSessionDetailView(APIView):
    """PATCH or DELETE a coaching session (only the owning trainer or Owner may modify it)."""

    permission_classes = [IsTrainerOrOwner]

    def _get_owned_session(self, request, pk):
        if not _has_session_table():
            return None, None, Response({"detail": "Run python manage.py migrate to enable scheduled sessions."}, status=503)
        user = _effective_trainer_user(request)
        profile = _get_trainer_profile_for_user(user)
        session = (
            services.defer_missing_trainer_fields(
                TrainerSession.objects.filter(pk=pk, is_active=True)
                .select_related("trainer__user"),
                prefix="trainer__",
            )
            .first()
        )
        if session is None:
            return None, None, Response({"detail": "Session not found."}, status=404)
        is_owner = getattr(user, "role", "") == "OWNER"
        if not is_owner and (profile is None or session.trainer_id != profile.pk):
            return None, None, Response(
                {"detail": "You can only modify your own coaching sessions."},
                status=403,
            )
        return session, profile, None

    def patch(self, request, pk):
        session, profile, err = self._get_owned_session(request, pk)
        if err is not None:
            return err
        fields = _validate_session_payload(request.data or {}, partial=True)
        if not fields:
            return Response({"detail": "Provide at least one field to update."}, status=400)
        for key, value in fields.items():
            setattr(session, key, value)
        session.save(update_fields=[*fields.keys(), "updated_at"])
        my_id = profile.pk if profile else None
        return Response(_session_json(session, my_trainer_id=my_id))

    def delete(self, request, pk):
        session, _profile, err = self._get_owned_session(request, pk)
        if err is not None:
            return err
        session.delete()
        return Response({"deleted": pk, "detail": "Session removed from schedule."})


class TrainerNotificationListView(APIView):
    """GET /api/trainer/notifications/ -> notifications for the active trainer with stats."""

    permission_classes = [IsTrainerOrOwner]

    def get(self, request):
        user = _effective_trainer_user(request)
        try:
            limit = min(max(int(request.query_params.get("limit", 40)), 1), 100)
        except ValueError:
            limit = 40
        kind = str(request.query_params.get("kind") or "").strip()
        unread_only = str(request.query_params.get("unread") or "").strip().lower() in ("1", "true", "yes")
        return Response(
            build_notification_payload(
                user,
                limit=limit,
                kind=kind,
                unread_only=unread_only,
            )
        )


class TrainerNotificationReadView(APIView):
    """POST /api/trainer/notifications/<int:pk>/read/"""

    permission_classes = [IsTrainerOrOwner]

    def post(self, request, pk):
        user = _effective_trainer_user(request)
        try:
            note = mark_read(user, pk)
        except LookupError:
            return Response({"detail": "Notification not found."}, status=404)
        return Response({
            "id": note.pk,
            "read": True,
            "read_at": note.read_at.isoformat() if note.read_at else None,
            "unread": unread_count(user),
        })


class TrainerNotificationReadAllView(APIView):
    """POST /api/trainer/notifications/read-all/"""

    permission_classes = [IsTrainerOrOwner]

    def post(self, request):
        user = _effective_trainer_user(request)
        mark_all_read(user)
        return Response({"unread": 0})


class TrainerNotificationDeleteView(APIView):
    """DELETE /api/trainer/notifications/<int:pk>/"""

    permission_classes = [IsTrainerOrOwner]

    def delete(self, request, pk):
        user = _effective_trainer_user(request)
        try:
            delete_notification(user, pk)
        except LookupError:
            return Response({"detail": "Notification not found."}, status=404)
        return Response({"deleted": pk, "unread": unread_count(user)})


class TrainerNotificationClearView(APIView):
    """POST /api/trainer/notifications/clear/"""

    permission_classes = [IsTrainerOrOwner]

    def post(self, request):
        user = _effective_trainer_user(request)
        read_only = bool(request.data.get("read_only", False))
        cleared = clear_notifications(user, read_only=read_only)
        return Response({"cleared": cleared, "unread": unread_count(user)})

