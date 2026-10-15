"""Single-sourced RBAC policy for ProFit.

These are PURE functions over ``(user, optional target)`` returning ``bool``.
They contain NO request or DRF imports and no HTTP concerns — the view and DRF
adapters in ``adapters.py`` translate these decisions into HTTP responses.

The helpers encode the AGENTS.md permission matrix EXACTLY and must not grant
any capability beyond it. A missing/anonymous user is always unauthorized.

    | Area                         | Owner | Cashier | Trainer | Member    |
    |------------------------------|-------|---------|---------|-----------|
    | Financial Dashboard / reports| Yes   | No      | No      | No        |
    | Record payments              | Yes   | Yes     | No      | Own only  |
    | Membership enrollment        | Yes   | Yes     | No      | No        |
    | Attendance records           | Yes   | Yes     | Yes     | View own  |
    | Own profile                  | Yes   | Yes     | Yes     | Yes       |
"""

from .models import Role


def _is_authenticated(user) -> bool:
    """Return True only for a concrete, authenticated user.

    Treats ``None`` and anonymous users (``is_authenticated`` falsy) as
    unauthorized, so every helper returns ``False`` for them.
    """
    return bool(user is not None and getattr(user, "is_authenticated", False))


def can_view_financials(user) -> bool:
    """Financial dashboard / reports: Owner only."""
    if not _is_authenticated(user):
        return False
    return user.role == Role.OWNER


def can_initiate_payment(user, member=None) -> bool:
    """Initiate a payment intent (intent only; NEVER writes payment status).

    Owner/Cashier may initiate for anyone; a Member may initiate only for their
    own profile. Status transitions (paid/failed) are webhook-only and are not
    gated by this helper.

    ``member`` is the target MemberProfile (or ``None`` when not applicable).
    """
    if not _is_authenticated(user):
        return False
    if user.role in (Role.OWNER, Role.CASHIER):
        return True
    if user.role == Role.MEMBER:
        # Member may only initiate for their own profile.
        return member is not None and getattr(member, "user_id", None) == user.pk
    return False


def can_manage_enrollment(user) -> bool:
    """Membership enrollment: Owner, Cashier."""
    if not _is_authenticated(user):
        return False
    return user.role in (Role.OWNER, Role.CASHIER)


def can_view_attendance(user, member=None) -> bool:
    """Attendance records: Owner/Cashier/Trainer for anyone; Member own only.

    ``member`` is the target MemberProfile (or ``None`` when not applicable).
    """
    if not _is_authenticated(user):
        return False
    if user.role in (Role.OWNER, Role.CASHIER, Role.TRAINER):
        return True
    if user.role == Role.MEMBER:
        return member is not None and getattr(member, "user_id", None) == user.pk
    return False


def can_edit_own_profile(user, target_user) -> bool:
    """Own profile: self only for ALL roles (no staff-edits-others)."""
    if not _is_authenticated(user):
        return False
    return target_user == user


def can_manage_staff_invites(user) -> bool:
    """Issue staff invites: Owner only."""
    if not _is_authenticated(user):
        return False
    return user.role == Role.OWNER
