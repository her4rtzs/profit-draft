"""Authoritative RBAC regression guard.

Two layers of assertion:

1. A table-driven matrix over EVERY pure helper in ``apps.accounts.permissions``
   for all four roles (Owner / Cashier / Trainer / Member) plus the
   anonymous/None user, including the self-vs-other distinction for
   ``can_initiate_payment``, ``can_view_attendance``, and
   ``can_edit_own_profile``. This encodes ONLY what the AGENTS.md matrix grants
   (no staff-edits-others).

2. Enforcement through BOTH thin adapters, proving the same policy reaches the
   wire:
     - the VIEW adapter (``role_required``) — wrong-role authenticated user gets
       403, anonymous user is redirected to ``LOGIN_URL``;
     - the DRF adapter (a ``BasePermission`` via ``APIClient``) — the same policy
       is enforced on a DRF endpoint (a Cashier is denied financials on both
       surfaces).

This module doubles as a test-only ``ROOT_URLCONF`` (see ``urlpatterns`` at the
bottom) so the DRF-adapter assertions have a real endpoint to call without
touching production routes.
"""

from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import path
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView

from apps.accounts import permissions
from apps.accounts.adapters import (
    CanManageEnrollment,
    CanViewAttendance,
    CanViewFinancials,
    role_required,
)
from apps.accounts.models import Role

User = get_user_model()


# --- Lightweight role stand-ins for the PURE helper matrix ------------------
# The pure helpers never touch the DB; they only read ``is_authenticated``,
# ``role`` and (for targets) ``pk`` / ``user_id``. A SimpleNamespace is enough
# and keeps the matrix a plain in-memory table (no fixtures per cell).

def _user(role, pk=1):
    return SimpleNamespace(is_authenticated=True, role=role, pk=pk)


def _member_target(user_id):
    """A MemberProfile stand-in exposing ``user_id`` for ownership checks."""
    return SimpleNamespace(user_id=user_id)


ANON = AnonymousUser()
OWNER = _user(Role.OWNER, pk=10)
CASHIER = _user(Role.CASHIER, pk=20)
TRAINER = _user(Role.TRAINER, pk=30)
MEMBER = _user(Role.MEMBER, pk=40)

ALL_ROLE_USERS = [OWNER, CASHIER, TRAINER, MEMBER]


class RbacHelperMatrixTests(SimpleTestCase):
    """Every helper, every role, plus anonymous/None -> False everywhere."""

    def test_can_view_financials_owner_only(self):
        expected = [
            (OWNER, True),
            (CASHIER, False),
            (TRAINER, False),
            (MEMBER, False),
        ]
        for user, allowed in expected:
            with self.subTest(role=user.role):
                self.assertIs(permissions.can_view_financials(user), allowed)

    def test_can_manage_enrollment_owner_and_cashier(self):
        expected = [
            (OWNER, True),
            (CASHIER, True),
            (TRAINER, False),
            (MEMBER, False),
        ]
        for user, allowed in expected:
            with self.subTest(role=user.role):
                self.assertIs(permissions.can_manage_enrollment(user), allowed)

    def test_can_initiate_payment_self_vs_other(self):
        own = _member_target(user_id=MEMBER.pk)
        other = _member_target(user_id=9999)
        # Staff may initiate for anyone (and with no target); Member only self.
        expected = [
            # (user, target, allowed)
            (OWNER, None, True),
            (OWNER, other, True),
            (CASHIER, None, True),
            (CASHIER, other, True),
            (TRAINER, None, False),
            (TRAINER, other, False),
            (MEMBER, None, False),
            (MEMBER, own, True),
            (MEMBER, other, False),
        ]
        for user, target, allowed in expected:
            with self.subTest(role=user.role, target=target):
                self.assertIs(
                    permissions.can_initiate_payment(user, target), allowed
                )

    def test_can_view_attendance_self_vs_other(self):
        own = _member_target(user_id=MEMBER.pk)
        other = _member_target(user_id=9999)
        # Owner/Cashier/Trainer may view anyone; Member only their own.
        expected = [
            (OWNER, None, True),
            (OWNER, other, True),
            (CASHIER, None, True),
            (CASHIER, other, True),
            (TRAINER, None, True),
            (TRAINER, other, True),
            (MEMBER, None, False),
            (MEMBER, own, True),
            (MEMBER, other, False),
        ]
        for user, target, allowed in expected:
            with self.subTest(role=user.role, target=target):
                self.assertIs(
                    permissions.can_view_attendance(user, target), allowed
                )

    def test_can_edit_own_profile_self_only_for_all_roles(self):
        # Every role may edit their OWN user and no one else's.
        for user in ALL_ROLE_USERS:
            other = _user(user.role, pk=user.pk + 500)
            with self.subTest(role=user.role):
                self.assertIs(permissions.can_edit_own_profile(user, user), True)
                self.assertIs(
                    permissions.can_edit_own_profile(user, other), False
                )

    def test_anonymous_and_none_are_denied_everywhere(self):
        own = _member_target(user_id=1)
        for bad in (ANON, None):
            with self.subTest(user=bad):
                self.assertFalse(permissions.can_view_financials(bad))
                self.assertFalse(permissions.can_manage_enrollment(bad))
                self.assertFalse(permissions.can_initiate_payment(bad))
                self.assertFalse(permissions.can_initiate_payment(bad, own))
                self.assertFalse(permissions.can_view_attendance(bad))
                self.assertFalse(permissions.can_view_attendance(bad, own))
                # Even "self" cannot be derived for an anonymous user.
                self.assertFalse(permissions.can_edit_own_profile(bad, bad))


# --- DRF adapter endpoints (test-only; served via ROOT_URLCONF below) -------


class _FinancialsView(APIView):
    """DRF endpoint guarded by the financials BasePermission adapter."""

    permission_classes = [CanViewFinancials]

    def get(self, request):
        return Response({"ok": True})


class _EnrollmentView(APIView):
    permission_classes = [CanManageEnrollment]

    def get(self, request):
        return Response({"ok": True})


class _AttendanceView(APIView):
    permission_classes = [CanViewAttendance]

    def get(self, request):
        return Response({"ok": True})


urlpatterns = [
    path("drf/financials/", _FinancialsView.as_view()),
    path("drf/enrollment/", _EnrollmentView.as_view()),
    path("drf/attendance/", _AttendanceView.as_view()),
]


@override_settings(ROOT_URLCONF=__name__)
class DrfAdapterEnforcementTests(TestCase):
    """The DRF BasePermission adapters enforce the same policy over APIClient."""

    def setUp(self):
        self.client = APIClient()

    def _as(self, username, role):
        user = User.objects.create_user(username=username, password="x", role=role)
        self.client.force_authenticate(user=user)
        return user

    def test_cashier_denied_financials_on_drf_surface(self):
        self._as("drf_cashier", Role.CASHIER)
        resp = self.client.get("/drf/financials/")
        self.assertEqual(resp.status_code, 403)

    def test_owner_allowed_financials_on_drf_surface(self):
        self._as("drf_owner", Role.OWNER)
        resp = self.client.get("/drf/financials/")
        self.assertEqual(resp.status_code, 200)

    def test_anonymous_denied_financials_on_drf_surface(self):
        # No auth -> SessionAuthentication yields anonymous -> 403.
        resp = self.client.get("/drf/financials/")
        self.assertEqual(resp.status_code, 403)

    def test_trainer_denied_enrollment_on_drf_surface(self):
        self._as("drf_trainer", Role.TRAINER)
        resp = self.client.get("/drf/enrollment/")
        self.assertEqual(resp.status_code, 403)

    def test_cashier_allowed_enrollment_on_drf_surface(self):
        self._as("drf_cashier2", Role.CASHIER)
        resp = self.client.get("/drf/enrollment/")
        self.assertEqual(resp.status_code, 200)

    def test_trainer_allowed_attendance_collection_on_drf_surface(self):
        # Trainer may view attendance for anyone (collection has no target).
        self._as("drf_trainer2", Role.TRAINER)
        resp = self.client.get("/drf/attendance/")
        self.assertEqual(resp.status_code, 200)

    def test_member_denied_attendance_collection_on_drf_surface(self):
        # A Member with no target is denied by can_view_attendance; the adapter
        # translates that to 403 on this blanket-guarded collection endpoint.
        self._as("drf_member", Role.MEMBER)
        resp = self.client.get("/drf/attendance/")
        self.assertEqual(resp.status_code, 403)


# --- VIEW adapter enforcement (role_required) -------------------------------

def _plain_ok_view(request):
    from django.http import HttpResponse

    return HttpResponse("ok")


_guarded_view = role_required(permissions.can_view_financials)(_plain_ok_view)

view_urlpatterns = [
    path("view/financials/", _guarded_view),
]


@override_settings(ROOT_URLCONF="apps.accounts.tests.test_permissions")
class ViewAdapterEnforcementTests(TestCase):
    """``role_required`` yields 403 for wrong role and a login redirect for anon.

    Reuses the module ``urlpatterns`` above plus the guarded view wired here.
    """

    def test_wrong_role_authenticated_gets_403(self):
        cashier = User.objects.create_user(
            username="view_cashier", password="x", role=Role.CASHIER
        )
        self.client.force_login(cashier)
        resp = self.client.get("/view/financials/")
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_is_redirected_to_login(self):
        resp = self.client.get("/view/financials/")
        self.assertEqual(resp.status_code, 302)
        # Default LOGIN_URL is /accounts/login/.
        self.assertIn("/accounts/login/", resp["Location"])
        self.assertIn("next=/view/financials/", resp["Location"])

    def test_owner_passes_the_view_gate(self):
        owner = User.objects.create_user(
            username="view_owner", password="x", role=Role.OWNER
        )
        self.client.force_login(owner)
        resp = self.client.get("/view/financials/")
        self.assertEqual(resp.status_code, 200)


# The view-adapter tests need their guarded route in the active urlconf. Since
# ROOT_URLCONF points at this module, expose both the DRF and view routes.
urlpatterns = urlpatterns + view_urlpatterns
