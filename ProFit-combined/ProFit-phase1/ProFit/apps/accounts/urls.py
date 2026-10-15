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
    path(
        "invite/accept/<int:invite_id>/<token>/",
        views.accept_invite_view,
        name="accept_invite",
    ),
]
