"""Trainer endpoints: the owner manages trainers and assignments; members pick or request one."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.membership.models import MemberProfile
from apps.trainers import services
from apps.trainers.models import TrainerProfile, TrainerRequest


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and getattr(request.user, "role", "") == "OWNER")


class IsMember(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and getattr(request.user, "role", "") == "MEMBER")


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
