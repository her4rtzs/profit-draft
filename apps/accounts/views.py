"""Plain Django function views for the member-auth pages.

NOT DRF APIViews — so ``CsrfViewMiddleware`` protects the anonymous POSTs (same
reasoning as ``api/auth.py``). Views stay thin: parse a form, call a service,
map the result/exception to a message + redirect/render. No business logic.
"""

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods, require_POST

from .forms import AcceptInviteForm, LoginForm, SignupForm, VerifyForm
from .models import User
from .services import (
    EmailDeliveryError,
    InvalidInviteError,
    OTPCooldownError,
    accept_invite,
    normalize_email,
    register_member,
    resend_otp,
    verify_otp,
)

GENERIC_INVALID_CODE = "That code is invalid or has expired."
CHECK_EMAIL_MESSAGE = "Check your email for a verification code."


def _pending_user(request):
    """Return the still-pending (inactive) user for the session, or None."""
    pending_id = request.session.get("pending_user_id")
    if not pending_id:
        return None
    return User.objects.filter(pk=pending_id, is_active=False).first()


@require_http_methods(["GET", "POST"])
def signup_view(request):
    if request.user.is_authenticated:
        return redirect(settings.LOGIN_REDIRECT_URL)

    if request.method == "POST":
        form = SignupForm(request.POST)
        if form.is_valid():
            try:
                result = register_member(
                    form.cleaned_data["email"],
                    form.cleaned_data["password"],
                )
            except ValidationError as exc:
                form.add_error(None, exc)
            else:
                request.session.pop("pending_decoy", None)
                if result.decoy:
                    request.session["pending_decoy"] = True
                    request.session.pop("pending_user_id", None)
                else:
                    request.session["pending_user_id"] = result.pending_user_id
                if result.delivery_failed:
                    messages.warning(
                        request,
                        "We couldn't send your code — use the Resend button.",
                    )
                else:
                    messages.info(request, CHECK_EMAIL_MESSAGE)
                return redirect("accounts:verify")
    else:
        form = SignupForm()
    return render(request, "accounts/signup.html", {"form": form})


@require_http_methods(["GET", "POST"])
def verify_view(request):
    if request.user.is_authenticated:
        return redirect(settings.LOGIN_REDIRECT_URL)

    decoy = request.session.get("pending_decoy", False)
    user = _pending_user(request)

    # A finished/stale funnel: no decoy flag and no pending inactive user.
    if user is None and not decoy:
        # If the pending id points at an already-active user, treat as finished.
        request.session.pop("pending_user_id", None)
        messages.info(request, "Start signup again.")
        return redirect("accounts:signup")

    if request.method == "POST":
        form = VerifyForm(request.POST)
        if not form.is_valid():
            messages.error(request, GENERIC_INVALID_CODE)
        elif decoy or user is None:
            # Decoy path: nothing was ever issued; fail generically.
            messages.error(request, GENERIC_INVALID_CODE)
        else:
            result = verify_otp(user, form.cleaned_data["code"])
            if result.ok:
                request.session.pop("pending_user_id", None)
                request.session.pop("pending_decoy", None)
                login(request, user)
                return redirect(settings.LOGIN_REDIRECT_URL)
            if result.reason == "capped":
                messages.error(
                    request,
                    "Too many attempts. Request a new code.",
                )
            else:
                messages.error(request, GENERIC_INVALID_CODE)
    else:
        form = VerifyForm()
    return render(request, "accounts/verify.html", {"form": form})


@require_POST
def resend_otp_view(request):
    decoy = request.session.get("pending_decoy", False)
    user = _pending_user(request)

    if user is None and not decoy:
        status = "expired"
    elif decoy or user is None:
        status = "sent"  # anti-enumeration: identical copy, nothing issued
    else:
        try:
            resend_otp(user)
            status = "sent"
        except OTPCooldownError:
            status = "cooldown"
        except EmailDeliveryError:
            status = "send_failed"

    return render(request, "accounts/_resend_status.html", {"status": status})


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.user.is_authenticated:
        return redirect(settings.LOGIN_REDIRECT_URL)

    if request.method == "POST":
        form = LoginForm(request.POST)
        if form.is_valid():
            norm = normalize_email(form.cleaned_data["email"])
            user = authenticate(
                request,
                username=norm,
                password=form.cleaned_data["password"],
            )
            if user is not None:
                login(request, user)
                next_url = request.POST.get("next") or request.GET.get("next")
                if next_url and url_has_allowed_host_and_scheme(
                    next_url,
                    allowed_hosts={request.get_host()},
                    require_https=request.is_secure(),
                ):
                    return redirect(next_url)
                return redirect(settings.LOGIN_REDIRECT_URL)
            messages.error(request, "Invalid credentials.")
    else:
        form = LoginForm()
    return render(request, "accounts/login.html", {"form": form})


@require_POST
@login_required
def logout_view(request):
    logout(request)
    return redirect(settings.LOGOUT_REDIRECT_URL)


@require_http_methods(["GET", "POST"])
def accept_invite_view(request, invite_id, token):
    if request.method == "POST":
        form = AcceptInviteForm(request.POST)
        if form.is_valid():
            try:
                user = accept_invite(
                    raw_token=token,
                    invite_id=invite_id,
                    password=form.cleaned_data["password"],
                )
            except InvalidInviteError:
                messages.error(
                    request,
                    "This invite link is invalid or expired.",
                )
            except ValidationError as exc:
                form.add_error("password", exc)
            else:
                login(request, user)
                return redirect(settings.LOGIN_REDIRECT_URL)
    else:
        form = AcceptInviteForm()
    return render(
        request,
        "accounts/accept_invite.html",
        {"form": form, "invite_id": invite_id, "token": token},
    )
