"""Plain Django function views for the member-auth pages.

NOT DRF APIViews — so ``CsrfViewMiddleware`` protects the anonymous POSTs (same
reasoning as ``api/auth.py``). Views stay thin: parse a form, call a service,
map the result/exception to a message + redirect/render. No business logic.
"""

import json
import secrets
import urllib.parse

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.http import HttpResponseRedirect, JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .forms import (
    AcceptInviteForm,
    LoginForm,
    OnboardingConsentForm,
    SignupForm,
    VerifyForm,
)
from .google_auth import (
    GOOGLE_SCOPES,
    GoogleAuthError,
    verify_google_access_token,
    verify_google_id_token,
)
from .models import EmailOTP, OTPPurpose, Role, User
from .services import (
    EmailDeliveryError,
    InvalidInviteError,
    InviteEmailMismatchError,
    InviteGoogleInUseError,
    OTPCooldownError,
    OTPRateLimitError,
    accept_invite,
    accept_invite_with_google,
    get_valid_staff_invite,
    issue_first_login_otp,
    normalize_email,
    record_legal_consent,
    register_member,
    resend_first_login_otp,
    resend_otp,
    role_home_url,
    verify_first_login_otp,
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
    cooldown_seconds = 0
    if user is not None:
        latest = EmailOTP.objects.filter(user=user, purpose=OTPPurpose.SIGNUP).order_by("-created_at").first()
        if latest is not None:
            elapsed = timezone.now() - latest.created_at
            cooldown_seconds = max(0, int((EmailOTP.RESEND_COOLDOWN - elapsed).total_seconds() + 0.999)) if elapsed < EmailOTP.RESEND_COOLDOWN else 0
    return render(request, "accounts/verify.html", {"form": form, "cooldown_seconds": cooldown_seconds})


@require_POST
def resend_otp_view(request):
    decoy = request.session.get("pending_decoy", False)
    user = _pending_user(request)
    retry_after = 60

    if user is None and not decoy:
        status = "expired"
        http_status = 400
        detail = "Your signup session expired — start again."
    elif decoy or user is None:
        status = "sent"  # anti-enumeration: identical copy, nothing issued
        http_status = 200
        detail = "A new code was sent. Check your email."
    else:
        try:
            resend_otp(user)
            status = "sent"
            http_status = 200
            detail = "A new code was sent. Check your email."
        except OTPCooldownError as exc:
            status = "cooldown"
            http_status = 429
            retry_after = exc.retry_after
            detail = f"Please wait {retry_after}s before requesting another code."
        except OTPRateLimitError as exc:
            status = "rate_limited"
            http_status = 429
            retry_after = min(exc.retry_after, 3600)
            detail = "Too many code requests. Please wait before trying again."
        except EmailDeliveryError:
            status = "send_failed"
            http_status = 503
            detail = "We couldn't send the code right now. Try again shortly."

    wants_json = (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        or "application/json" in request.headers.get("Accept", "")
    )
    if wants_json:
        return JsonResponse(
            {"status": status, "detail": detail, "retry_after": retry_after},
            status=http_status,
        )
    return render(request, "accounts/_resend_status.html", {"status": status, "detail": detail})


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.user.is_authenticated:
        return redirect(role_home_url(request.user))

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


def _post_onboarding_redirect_url(user):
    if getattr(user, "role", "") in ("CASHIER", "TRAINER") and not (
        getattr(user, "onboarding_data", None) or {}
    ).get("completed"):
        return "/onboarding"
    return role_home_url(user)


def _first_login_cooldown_seconds(user) -> int:
    latest = (
        EmailOTP.objects.filter(user=user, purpose=OTPPurpose.FIRST_LOGIN)
        .order_by("-created_at")
        .first()
    )
    if latest is None:
        return 0
    elapsed = timezone.now() - latest.created_at
    if elapsed < EmailOTP.RESEND_COOLDOWN:
        return max(0, int((EmailOTP.RESEND_COOLDOWN - elapsed).total_seconds() + 0.999))
    return 0


@login_required
@require_GET
def onboarding_gate_view(request):
    user = request.user
    if getattr(user, "needs_first_login_otp", False):
        return redirect("accounts:onboarding_otp")
    if getattr(user, "needs_legal_consent", False):
        return redirect("accounts:onboarding_consent")
    return redirect(_post_onboarding_redirect_url(user))


@login_required
@require_http_methods(["GET", "POST"])
def onboarding_otp_view(request):
    user = request.user
    if not getattr(user, "needs_first_login_otp", False):
        if getattr(user, "needs_legal_consent", False):
            return redirect("accounts:onboarding_consent")
        return redirect(_post_onboarding_redirect_url(user))

    http_status = 200
    if request.method == "GET":
        try:
            issued = issue_first_login_otp(user, force_resend=False)
            if issued is not None:
                messages.info(request, CHECK_EMAIL_MESSAGE)
        except (OTPCooldownError, OTPRateLimitError):
            pass
        except EmailDeliveryError:
            messages.warning(
                request,
                "We couldn't send your verification code right now — use the Resend button.",
            )
        form = VerifyForm()
    else:
        form = VerifyForm(request.POST)
        if not form.is_valid():
            http_status = 400
            messages.error(request, GENERIC_INVALID_CODE)
        else:
            result = verify_first_login_otp(user, form.cleaned_data["code"])
            if result.ok:
                if getattr(user, "needs_legal_consent", False):
                    return redirect("accounts:onboarding_consent")
                return redirect(_post_onboarding_redirect_url(user))
            http_status = 400
            if result.reason == "capped":
                messages.error(
                    request,
                    "Too many wrong attempts. This code is locked — request a new code.",
                )
            elif result.reason == "expired":
                messages.error(
                    request,
                    "That verification code has expired. Request a new code.",
                )
            else:
                messages.error(request, GENERIC_INVALID_CODE)

    return render(
        request,
        "accounts/onboarding_otp.html",
        {
            "form": form,
            "cooldown_seconds": _first_login_cooldown_seconds(user),
            "step_label": "Step 1 of 2",
        },
        status=http_status,
    )


@login_required
@require_POST
def onboarding_otp_resend_view(request):
    user = request.user
    if not getattr(user, "needs_first_login_otp", False):
        return JsonResponse(
            {"status": "done", "detail": "Verification already completed."},
            status=200,
        )

    retry_after = 60
    try:
        resend_first_login_otp(user)
        status_key = "sent"
        http_status = 200
        detail = "A new verification code was sent to your email."
    except OTPCooldownError as exc:
        status_key = "cooldown"
        http_status = 429
        retry_after = exc.retry_after
        detail = f"Please wait {retry_after}s before requesting another code."
    except OTPRateLimitError as exc:
        status_key = "rate_limited"
        http_status = 429
        retry_after = min(exc.retry_after, 3600)
        detail = "Too many code requests. Please wait before trying again."
    except EmailDeliveryError:
        status_key = "send_failed"
        http_status = 503
        detail = "We couldn't send the code right now. Try again shortly."

    wants_json = (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        or "application/json" in request.headers.get("Accept", "")
    )
    if wants_json:
        return JsonResponse(
            {"status": status_key, "detail": detail, "retry_after": retry_after},
            status=http_status,
        )
    if status_key == "sent":
        messages.info(request, detail)
    else:
        messages.error(request, detail)
    return redirect("accounts:onboarding_otp")


@login_required
@require_http_methods(["GET", "POST"])
def onboarding_consent_view(request):
    user = request.user
    if getattr(user, "needs_first_login_otp", False):
        return redirect("accounts:onboarding_otp")
    if not getattr(user, "needs_legal_consent", False):
        return redirect(_post_onboarding_redirect_url(user))

    http_status = 200
    if request.method == "POST":
        form = OnboardingConsentForm(request.POST)
        if form.is_valid():
            record_legal_consent(user)
            return redirect(_post_onboarding_redirect_url(user))
        http_status = 400
    else:
        form = OnboardingConsentForm()

    return render(
        request,
        "accounts/onboarding_consent.html",
        {
            "form": form,
            "step_label": "Step 2 of 2",
        },
        status=http_status,
    )


@require_http_methods(["GET", "POST"])
def accept_invite_view(request, invite_id, token):
    invite = None
    invite_valid = False
    try:
        invite = get_valid_staff_invite(raw_token=token, invite_id=invite_id)
        invite_valid = True
    except InvalidInviteError:
        invite_valid = False

    http_status = 200
    if request.method == "POST":
        form = AcceptInviteForm(request.POST)
        if not invite_valid:
            http_status = 400
            messages.error(request, "This invite link is invalid, expired, or revoked.")
        elif form.is_valid():
            try:
                user = accept_invite(
                    raw_token=token,
                    invite_id=invite_id,
                    password=form.cleaned_data["password"],
                )
            except InvalidInviteError:
                http_status = 400
                invite_valid = False
                messages.error(
                    request,
                    "This invite link is invalid, expired, or revoked.",
                )
            except ValidationError as exc:
                http_status = 400
                form.add_error("password", exc)
            else:
                login(request, user)
                if getattr(user, "role", "") in ("CASHIER", "TRAINER") and not (
                    getattr(user, "onboarding_data", None) or {}
                ).get("completed"):
                    return redirect("/onboarding")
                return redirect(settings.LOGIN_REDIRECT_URL)
        else:
            http_status = 400
    else:
        form = AcceptInviteForm()

    google_err_code = (request.GET.get("google_error") or "").strip()
    google_err_msg = (request.GET.get("google_msg") or "").strip()
    if google_err_code and not google_err_msg:
        google_err_msg = {
            "invite_email_mismatch": "Your Google email must match the invited email address.",
            "google_sub_in_use": "This Google account is already connected to another ProFit user.",
            "cancelled": "Google sign-in was cancelled.",
            "invalid_state": "Your Google session expired. Please try again.",
        }.get(google_err_code, "Could not accept the invite with Google. Please try again.")

    client_id = (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip()
    client_secret = (getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "").strip()
    return render(
        request,
        "accounts/accept_invite.html",
        {
            "form": form,
            "invite_id": invite_id,
            "token": token,
            "invite": invite,
            "invite_valid": invite_valid,
            "role_label": invite.get_role_display() if invite else "Staff",
            "google_client_id": client_id,
            "oauth_redirect_enabled": bool(client_id and client_secret),
            "google_error_msg": google_err_msg,
        },
        status=http_status,
    )


@require_POST
def accept_invite_google_view(request, invite_id, token):
    """POST /accounts/invite/accept/<id>/<token>/google/: accept staff invite via Google email match."""
    try:
        data = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    credential = data.get("credential")
    access_token = data.get("access_token")
    has_cred = isinstance(credential, str) and bool(credential.strip())
    has_access = isinstance(access_token, str) and bool(access_token.strip())
    if not has_cred and not has_access:
        return JsonResponse({"detail": "Missing Google credential."}, status=400)

    try:
        claims = (
            verify_google_id_token(credential.strip())
            if has_cred
            else verify_google_access_token(access_token.strip())
        )
        user = accept_invite_with_google(raw_token=token, invite_id=invite_id, claims=claims)
    except GoogleAuthError as exc:
        return JsonResponse({"detail": exc.message, "code": exc.code}, status=exc.status_code)
    except InviteEmailMismatchError as exc:
        return JsonResponse({"detail": str(exc), "code": "invite_email_mismatch"}, status=403)
    except InviteGoogleInUseError as exc:
        return JsonResponse({"detail": str(exc), "code": "google_sub_in_use"}, status=409)
    except InvalidInviteError:
        return JsonResponse(
            {"detail": "This invite link is invalid, expired, or revoked.", "code": "invalid_invite"},
            status=400,
        )

    user.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, user)
    return JsonResponse(
        {
            "status": "authenticated",
            "redirect": "/accounts/onboarding/",
        }
    )


@require_GET
def accept_invite_google_start_view(request, invite_id, token):
    """GET /accounts/invite/accept/<id>/<token>/google/start/: OAuth redirect fallback for invite."""
    try:
        invite = get_valid_staff_invite(raw_token=token, invite_id=invite_id)
    except InvalidInviteError:
        back = reverse("accounts:accept_invite", kwargs={"invite_id": invite_id, "token": token})
        return HttpResponseRedirect(f"{back}?google_error=invalid_invite")

    client_id = (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip()
    client_secret = (getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "").strip()
    if not client_id or not client_secret:
        back = reverse("accounts:accept_invite", kwargs={"invite_id": invite_id, "token": token})
        return HttpResponseRedirect(f"{back}?google_error=not_configured")

    from api.auth import _google_callback_url

    state = secrets.token_urlsafe(24)
    request.session["google_oauth_state"] = state
    request.session["google_oauth_source"] = "invite"
    request.session["google_oauth_invite_id"] = invite_id
    request.session["google_oauth_invite_token"] = token
    params = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": _google_callback_url(request),
            "response_type": "code",
            "scope": GOOGLE_SCOPES,
            "state": state,
            "login_hint": invite.email,
            "prompt": "select_account",
        }
    )
    return HttpResponseRedirect(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")
