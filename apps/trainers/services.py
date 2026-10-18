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
