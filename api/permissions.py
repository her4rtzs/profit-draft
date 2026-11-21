"""Request-time enforcement of trial and membership access.

These permissions only narrow what a MEMBER may do; staff and trainer roles pass
through unchanged and keep their own permission classes. Expiry is computed on
every request, so no status write or scheduled job is needed.
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from apps.membership.models import MemberProfile
from apps.membership.services import (
    NO_MEMBERSHIP_MESSAGE,
    TRIAL_ENDED_MESSAGE,
    TRIAL_PROFILE_ONLY_MESSAGE,
    member_access,
)


class MemberAccess(BasePermission):
    """An active membership is required; a running trial is not enough."""

    allow_trial = False
    allow_locked_portal = False

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if getattr(user, "role", "") != "MEMBER":
            return True
        profile = MemberProfile.objects.filter(user=user).first()
        if profile is None:
            # Let each view decide (404 from /me/, [] from attendance, etc).
            return True
        state = member_access(profile)
        if state == "LOCKED" and not self.allow_locked_portal:
            message = (
                TRIAL_ENDED_MESSAGE
                if profile.trial_ends_at is not None
                else NO_MEMBERSHIP_MESSAGE
            )
            raise PermissionDenied(message)
        if state == "TRIAL" and not self.allow_trial:
            raise PermissionDenied(TRIAL_PROFILE_ONLY_MESSAGE)
        return True


class TrialAllowedMemberAccess(MemberAccess):
    """Own profile reads and edits are allowed while in trial or restricted/expired portal mode."""

    allow_trial = True
    allow_locked_portal = True


class CanReviewClaims(BasePermission):
    """Owner or Cashier only, and the account must be active."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_active", False)
            and getattr(user, "role", "") in ("OWNER", "CASHIER")
        )


class IsActiveOwner(BasePermission):
    """Owner-only permission checking login, active flag, and OWNER role."""

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_active", False)
            and str(getattr(user, "role", "")).upper() == "OWNER"
        )
