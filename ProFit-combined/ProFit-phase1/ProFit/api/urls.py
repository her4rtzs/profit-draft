"""DRF and session-auth routing for the ProFit web app and native shells, mounted at /api/."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import auth
from .member import MemberMeView
from rest_framework.routers import SimpleRouter

from .staff import StaffAttendanceView, StaffCheckInView, StaffMemberViewSet
from .views import MemberProfileViewSet, MyAttendanceViewSet

router = DefaultRouter()
router.register("membership", MemberProfileViewSet, basename="membership")
router.register("attendance", MyAttendanceViewSet, basename="attendance")

staff_router = SimpleRouter()
staff_router.register("staff/members", StaffMemberViewSet, basename="staff-members")

urlpatterns = [
    path("auth/csrf/", auth.csrf, name="auth-csrf"),
    path("auth/login/", auth.login_view, name="auth-login"),
    path("auth/logout/", auth.logout_view, name="auth-logout"),
    path("auth/session/", auth.session_view, name="auth-session"),
    path("member/me/", MemberMeView.as_view(), name="member-me"),
    path("staff/attendance/", StaffAttendanceView.as_view(), name="staff-attendance"),
    path("staff/attendance/check-in/", StaffCheckInView.as_view(), name="staff-checkin"),
    *staff_router.urls,
    *router.urls,
]
