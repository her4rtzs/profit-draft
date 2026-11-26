"""URL routes for the member-auth HTML pages (additive; under /accounts/)."""

from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("signup/", views.signup_view, name="signup"),
    path("verify/", views.verify_view, name="verify"),
    path("resend/", views.resend_otp_view, name="resend_otp"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("onboarding/", views.onboarding_gate_view, name="onboarding_gate"),
    path("onboarding/otp/", views.onboarding_otp_view, name="onboarding_otp"),
    path("onboarding/otp/resend/", views.onboarding_otp_resend_view, name="onboarding_otp_resend"),
    path("onboarding/consent/", views.onboarding_consent_view, name="onboarding_consent"),
    path(
        "invite/accept/<int:invite_id>/<token>/",
        views.accept_invite_view,
        name="accept_invite",
    ),
    path(
        "invite/accept/<int:invite_id>/<token>/google/",
        views.accept_invite_google_view,
        name="accept_invite_google",
    ),
    path(
        "invite/accept/<int:invite_id>/<token>/google/start/",
        views.accept_invite_google_start_view,
        name="accept_invite_google_start",
    ),
]
