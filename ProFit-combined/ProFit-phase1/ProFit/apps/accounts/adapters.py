"""Thin HTTP adapters over the pure RBAC helpers in ``permissions.py``.

These adapters own ONLY the HTTP translation (403 vs login redirect vs DRF
403/401). All policy lives in ``permissions.py``; nothing here adds or changes
a capability.
"""

from functools import wraps

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.core.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from . import permissions


def role_required(checker):
    """Django-view decorator gating access via a pure RBAC ``checker(user)``.

    - Anonymous user  -> redirect to ``LOGIN_URL`` (preserving ``next``).
    - Authenticated but unauthorized -> raise ``PermissionDenied`` (403).
    """

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            user = getattr(request, "user", None)
            if user is None or not user.is_authenticated:
                return redirect_to_login(
                    request.get_full_path(),
                    settings.LOGIN_URL,
                )
            if not checker(user):
                raise PermissionDenied
            return view_func(request, *args, **kwargs)

        return _wrapped

    return decorator


class CanViewFinancials(BasePermission):
    """DRF permission delegating to ``can_view_financials``."""

    def has_permission(self, request, view):
        return permissions.can_view_financials(request.user)

    def has_object_permission(self, request, view, obj):
        return permissions.can_view_financials(request.user)


class CanManageEnrollment(BasePermission):
    """DRF permission delegating to ``can_manage_enrollment``."""

    def has_permission(self, request, view):
        return permissions.can_manage_enrollment(request.user)

    def has_object_permission(self, request, view, obj):
        return permissions.can_manage_enrollment(request.user)


class CanViewAttendance(BasePermission):
    """DRF permission delegating to ``can_view_attendance``.

    Object-level checks pass the object as the ``member`` target so a Member can
    only read their own records.
    """

    def has_permission(self, request, view):
        return permissions.can_view_attendance(request.user)

    def has_object_permission(self, request, view, obj):
        return permissions.can_view_attendance(request.user, obj)
