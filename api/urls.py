"""DRF and session-auth routing for the ProFit web app and native shells, mounted at /api/."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import auth
from .join import JoinCheckoutView, JoinConfirmView
from .member import MemberCheckoutView, MemberMeView
from rest_framework.routers import SimpleRouter

from .trainers import (
    MemberTrainerRequestCancelView,
    MemberTrainerRequestView,
    MemberTrainerView,
    StaffMemberTrainerRemoveView,
    StaffMemberTrainerView,
    StaffTrainerCandidatesView,
    StaffTrainerDetailView,
    StaffTrainerListView,
    StaffTrainerRequestDecideView,
    StaffTrainerRequestListView,
)
from .announcements import (
    MemberAnnouncementListView,
    StaffAnnouncementArchiveView,
    StaffAnnouncementDetailView,
    StaffAnnouncementListView,
    StaffAnnouncementPublishView,
)
from .notifications import NotificationListView, NotificationReadAllView, NotificationReadView
from .staff import (
    StaffAttendanceView,
    StaffCheckInView,
    StaffMemberViewSet,
    StaffPaymentDetailView,
    StaffPaymentView,
    StaffSummaryView,
)
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
    path("auth/verify-password/", auth.verify_password_view, name="auth-verify-password"),
    path("auth/change-password/", auth.change_password_view, name="auth-change-password"),
    path("join/checkout/", JoinCheckoutView.as_view(), name="join-checkout"),
    path("join/confirm/", JoinConfirmView.as_view(), name="join-confirm"),
    path("member/me/", MemberMeView.as_view(), name="member-me"),
    path("member/checkout/", MemberCheckoutView.as_view(), name="member-checkout"),
    path("staff/attendance/", StaffAttendanceView.as_view(), name="staff-attendance"),
    path("staff/attendance/check-in/", StaffCheckInView.as_view(), name="staff-checkin"),
    path("staff/payments/", StaffPaymentView.as_view(), name="staff-payments"),
    path("staff/payments/<int:pk>/", StaffPaymentDetailView.as_view(), name="staff-payment-detail"),
    path("staff/reports/summary/", StaffSummaryView.as_view(), name="staff-summary"),
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("notifications/read-all/", NotificationReadAllView.as_view(), name="notifications-read-all"),
    path("notifications/<int:pk>/read/", NotificationReadView.as_view(), name="notification-read"),
    path("announcements/", MemberAnnouncementListView.as_view(), name="announcements"),
    path("staff/announcements/", StaffAnnouncementListView.as_view(), name="staff-announcements"),
    path("staff/announcements/<int:pk>/", StaffAnnouncementDetailView.as_view(), name="staff-announcement-detail"),
    path("staff/announcements/<int:pk>/publish/", StaffAnnouncementPublishView.as_view(), name="staff-announcement-publish"),
    path("staff/announcements/<int:pk>/archive/", StaffAnnouncementArchiveView.as_view(), name="staff-announcement-archive"),
    path("staff/trainers/", StaffTrainerListView.as_view(), name="staff-trainers"),
    path("staff/trainers/candidates/", StaffTrainerCandidatesView.as_view(), name="staff-trainer-candidates"),
    path("staff/trainers/<int:pk>/", StaffTrainerDetailView.as_view(), name="staff-trainer-detail"),
    path("staff/members/<int:pk>/trainer/", StaffMemberTrainerView.as_view(), name="staff-member-trainer"),
    path("staff/members/<int:pk>/trainer/remove/", StaffMemberTrainerRemoveView.as_view(), name="staff-member-trainer-remove"),
    path("staff/trainer-requests/", StaffTrainerRequestListView.as_view(), name="staff-trainer-requests"),
    path("staff/trainer-requests/<int:pk>/decide/", StaffTrainerRequestDecideView.as_view(), name="staff-trainer-request-decide"),
    path("trainer/me/", MemberTrainerView.as_view(), name="member-trainer"),
    path("trainer-requests/", MemberTrainerRequestView.as_view(), name="member-trainer-request"),
    path("trainer-requests/<int:pk>/cancel/", MemberTrainerRequestCancelView.as_view(), name="member-trainer-request-cancel"),
    *staff_router.urls,
    *router.urls,
]
