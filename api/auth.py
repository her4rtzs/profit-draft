"""Session-auth endpoints for the ProFit web app and its installed/native shells.

Same origin, so cookies work without CORS:
  1. GET  /api/auth/csrf/   sets the ``csrftoken`` cookie.
  2. POST /api/auth/login/  body {"identity": email-or-username, "password"}.
                            ``username`` is still accepted for older clients.
                            The client echoes the cookie in ``X-CSRFToken``.
  3. GET  /api/auth/session/ {"user": {..., "role": ADMIN | TRAINER | MEMBER}} or 401.
  4. POST /api/auth/logout/ ends the session.
  5. POST /api/auth/change-password/ body {"current_password", "new_password"};
                            signed-in users of every role change their own password.

These are plain Django views on purpose: CsrfViewMiddleware then enforces CSRF on
the anonymous login POST as well. No business logic lives here.
LOGGING POLICY: never log credentials or PII.
"""

import hmac
import json
import logging
import secrets
import urllib.parse

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.db import DatabaseError
from django.http import HttpResponseRedirect, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from apps.accounts.google_auth import (
    GOOGLE_SCOPES,
    GoogleAuthError,
    authenticate_google_member,
    connect_google_account,
    disconnect_google_account,
    ensure_google_user_columns,
    exchange_google_code,
    verify_and_link_google_account,
    verify_google_access_token,
    verify_google_id_token,
)
from apps.accounts.forms import VerifyForm
from apps.accounts.models import EmailOTP, OTPPurpose
from apps.accounts.services import (
    EmailDeliveryError,
    InvalidInviteError,
    InviteEmailMismatchError,
    InviteGoogleInUseError,
    OTPCooldownError,
    OTPRateLimitError,
    accept_invite_with_google,
    issue_first_login_otp,
    record_legal_consent,
    resend_first_login_otp,
    role_home_url,
    verify_first_login_otp,
)
from apps.accounts.validators import validate_real_email

# Backend roles -> the four web portal shells.
WEB_ROLE = {"OWNER": "ADMIN", "CASHIER": "CASHIER", "TRAINER": "TRAINER", "MEMBER": "MEMBER"}

logger = logging.getLogger("api.auth")


def _log_google_db_error(step, exc):
    # First line only: PostgreSQL DETAIL/CONTEXT lines can carry values/tokens.
    message = str(exc).splitlines()[0][:200]
    pgcode = getattr(getattr(exc, "__cause__", None), "pgcode", "") or ""
    logger.error(
        "event=google_db_error step=%s type=%s pgcode=%s message=%s",
        step, type(exc).__name__, pgcode, message,
    )


@ensure_csrf_cookie
def csrf(request):
    ensure_google_user_columns()
    return JsonResponse({"detail": "CSRF cookie set."})


def _username_for(identity):
    """Accept an email or a username. Emails match case-insensitively."""
    identity = (identity or "").strip()
    if "@" in identity:
        User = get_user_model()
        found = User.objects.filter(email__iexact=identity).values_list("username", flat=True).first()
        return found or identity
    return identity


@require_POST
def login_view(request):
    ensure_google_user_columns()
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    if not isinstance(payload, dict):
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    identity = payload.get("identity") or payload.get("username")
    if isinstance(identity, str) and "@" in identity:
        try:
            identity = validate_real_email(identity)
        except ValidationError as exc:
            return JsonResponse({"detail": exc.messages[0]}, status=400)
    user = authenticate(request, username=_username_for(identity), password=payload.get("password"))
    if user is None:
        return JsonResponse({"detail": "Invalid credentials."}, status=401)

    login(request, user)
    next_url = payload.get("next")
    if next_url and url_has_allowed_host_and_scheme(
        next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        from profit.views import resolve_post_login_redirect

        redirect_url = resolve_post_login_redirect(user, next_url)
    else:
        redirect_url = role_home_url(user)
    return JsonResponse({
        "detail": "Logged in.",
        "redirect": redirect_url,
        "role": user.role,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
    })


def _session_user_dict(user):
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    full_name = f"{first} {last}".strip()
    role = getattr(user, "role", "")
    user_ob = getattr(user, "onboarding_data", None) or {}
    onboarding_completed = True
    if role == "MEMBER":
        from apps.membership.models import MemberProfile

        profile = MemberProfile.objects.filter(user=user).only("onboarding_data").first()
        member_ob = (getattr(profile, "onboarding_data", None) or {}) if profile else {}
        onboarding_completed = bool(member_ob.get("completed") or user_ob.get("completed")) if profile else True
    elif role in ("CASHIER", "TRAINER"):
        onboarding_completed = bool(user_ob.get("completed"))
    return {
        "id": user.pk,
        "name": full_name,
        "name_missing": not (first and last),
        "email": user.email,
        "role": WEB_ROLE.get(role, "MEMBER"),
        "photo": getattr(user, "avatar_data", "") or "",
        "onboarding_completed": onboarding_completed,
        "onboarding": user_ob,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
        "google_connected": bool(getattr(user, "google_sub", None)),
        "google_email": getattr(user, "google_email", "") or "",
        "has_password": bool(user.has_usable_password()),
        "needs_first_login_otp": bool(getattr(user, "needs_first_login_otp", False)),
        "needs_legal_consent": bool(getattr(user, "needs_legal_consent", False)),
        "requires_first_login_gate": bool(getattr(user, "requires_first_login_gate", False)),
    }


def _sanitize_staff_onboarding(raw):
    if not isinstance(raw, dict):
        return None
    def clean_list(val, max_items=10, max_len=50):
        if not isinstance(val, list):
            return []
        return [str(x).strip()[:max_len] for x in val if str(x).strip()][:max_items]
    return {
        "phone": str(raw.get("phone") or "").strip()[:30],
        "shift": str(raw.get("shift") or "").strip()[:40],
        "ack": bool(raw.get("ack", False)),
        "specialties": clean_list(raw.get("specialties"), 12, 50),
        "years_experience": str(raw.get("years_experience") or "").strip()[:20],
        "certifications": str(raw.get("certifications") or "").strip()[:500],
        "days": clean_list(raw.get("days"), 7, 15),
        "slot": str(raw.get("slot") or "").strip()[:40],
        "completed": bool(raw.get("completed", True)),
    }


@require_GET
def session_view(request):
    ensure_google_user_columns()
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    return JsonResponse({"user": _session_user_dict(user)})


def update_profile_view(request):
    """PATCH/POST /api/auth/profile/ — let any signed-in active user update their name and/or avatar."""
    from apps.membership.services import validate_full_name

    if request.method not in ("PATCH", "POST"):
        return JsonResponse({"detail": "Method not allowed."}, status=405)
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    update_fields = []
    if "name" in data:
        try:
            first, last = validate_full_name(data.get("name"))
        except ValidationError as exc:
            return JsonResponse({"detail": exc.messages[0]}, status=400)
        user.first_name = first
        user.last_name = last
        update_fields.extend(["first_name", "last_name"])

    if "photo" in data:
        photo = data.get("photo")
        if photo is None:
            photo = ""
        if not isinstance(photo, str):
            return JsonResponse({"detail": "Invalid profile photo format."}, status=400)
        photo = photo.strip()
        allowed_presets = {"av-1", "av-2", "av-3", "av-4", "av-5", "av-6"}
        if photo and photo not in allowed_presets:
            if not photo.startswith("data:image/"):
                return JsonResponse({"detail": "Profile photo must be an image."}, status=400)
            if len(photo) > 1_350_000:
                return JsonResponse({"detail": "That photo is too large. Please pick one under 900 KB."}, status=400)
        user.avatar_data = photo
        update_fields.append("avatar_data")

    if "onboarding" in data:
        cleaned_ob = _sanitize_staff_onboarding(data.get("onboarding"))
        if cleaned_ob is None:
            return JsonResponse({"detail": "Invalid onboarding payload."}, status=400)
        user.onboarding_data = cleaned_ob
        update_fields.append("onboarding_data")

    if not update_fields:
        return JsonResponse({"detail": "Nothing to update."}, status=400)

    user.save(update_fields=list(dict.fromkeys(update_fields)))

    # Keep TrainerProfile contact/specialization in sync if the user is a Trainer.
    if getattr(user, "role", "") == "TRAINER" and "onboarding" in data:
        from apps.trainers.models import TrainerProfile
        from apps.trainers.services import defer_missing_trainer_fields, has_trainer_phone_column

        tp = defer_missing_trainer_fields(TrainerProfile.objects.filter(user=user)).first()
        if tp is not None:
            ob = user.onboarding_data or {}
            tp_fields = []
            if ob.get("phone") and has_trainer_phone_column():
                tp.phone = ob["phone"][:40]
                tp_fields.append("phone")
            if ob.get("specialties"):
                tp.specialization = ", ".join(ob["specialties"])[:120]
                tp_fields.append("specialization")
            if tp_fields:
                tp.save(update_fields=tp_fields)

    return JsonResponse({"detail": "Profile updated.", "user": _session_user_dict(user)})


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"detail": "Logged out."})


@require_POST
def change_password_view(request):
    """Let any signed-in user change their own password.

    A wrong current password is a 400 (not 401) so the web client does not read
    it as an expired session. The session stays signed in afterwards. Neither
    password is ever logged or echoed back.
    """
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    if not isinstance(payload, dict):
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    current = payload.get("current_password")
    new = payload.get("new_password")
    if not isinstance(current, str) or not isinstance(new, str) or not current or not new:
        return JsonResponse({"detail": "Enter your current and new password."}, status=400)
    if not user.check_password(current):
        return JsonResponse({"detail": "Your current password is incorrect."}, status=400)
    if new == current:
        return JsonResponse({"detail": "Choose a new password that is different from the current one."}, status=400)
    try:
        validate_password(new, user)
    except ValidationError as exc:
        return JsonResponse({"detail": " ".join(exc.messages)}, status=400)

    user.set_password(new)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    update_session_auth_hash(request, user)
    return JsonResponse({"detail": "Password changed."})


@require_POST
def verify_password_view(request):
    """Check the signed-in user's current password without changing anything.

    Used as step one of the change-password form. A wrong password is a 400 (not
    401) so the web client does not treat it as an expired session. The password
    is never logged or echoed back.
    """
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    current = payload.get("current_password") if isinstance(payload, dict) else None
    if not isinstance(current, str) or not current:
        return JsonResponse({"detail": "Enter your current password."}, status=400)
    if not user.check_password(current):
        return JsonResponse({"detail": "That is not your current password."}, status=400)
    return JsonResponse({"detail": "Verified."})


def _json_body(request):
    try:
        data = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


@require_POST
def forgot_password_view(request):
    """Email a reset code. Preserves anti-enumeration while surfacing real delivery errors."""
    from apps.accounts.services import EmailDeliveryError, OTPRateLimitError, request_password_reset

    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    try:
        cooldown_seconds = request_password_reset(data.get("email"))
    except OTPRateLimitError as exc:
        return JsonResponse(
            {
                "status": "rate_limited",
                "detail": "Too many OTP requests. Please wait before trying again.",
                "retry_after": min(exc.retry_after, 3600),
            },
            status=429,
        )
    except EmailDeliveryError:
        return JsonResponse(
            {
                "status": "send_failed",
                "detail": "We couldn't send the verification code right now. Please try again shortly.",
            },
            status=503,
        )
    return JsonResponse({
        "status": "sent",
        "detail": "If that email has an account, a code is on its way.",
        "cooldown_seconds": cooldown_seconds,
    })


@require_POST
def verify_reset_otp_view(request):
    from apps.accounts.services import verify_password_reset_otp

    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    ok, message = verify_password_reset_otp(data.get("email"), data.get("code"))
    return JsonResponse({"detail": message}, status=200 if ok else 400)


@require_POST
def reset_password_view(request):
    from apps.accounts.services import reset_password

    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    ok, message = reset_password(data.get("email"), data.get("code"), data.get("new_password"))
    return JsonResponse({"detail": message}, status=200 if ok else 400)


@require_POST
def resend_otp_api_view(request):
    """POST /api/auth/resend-otp/: re-issue a fresh 6-digit OTP and invalidate prior codes."""
    from apps.accounts.models import OTPPurpose
    from apps.accounts.services import (
        EmailDeliveryError,
        OTPCooldownError,
        OTPRateLimitError,
        normalize_email,
        resend_otp,
        resend_password_reset_otp,
    )

    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    purpose = str(data.get("purpose") or OTPPurpose.PASSWORD_RESET).strip().upper()
    if purpose not in {OTPPurpose.PASSWORD_RESET, OTPPurpose.SIGNUP}:
        return JsonResponse({"detail": "Unsupported OTP purpose."}, status=400)

    if purpose == OTPPurpose.SIGNUP:
        User = get_user_model()
        pending_id = request.session.get("pending_user_id")
        decoy = request.session.get("pending_decoy", False)
        user = User.objects.filter(pk=pending_id, is_active=False).first() if pending_id else None
        if user is None and isinstance(data.get("email"), str) and data["email"].strip():
            norm = normalize_email(data["email"])
            user = User.objects.filter(email__iexact=norm, is_active=False).first()
            if user is None and User.objects.filter(email__iexact=norm, is_active=True).exists():
                decoy = True
        if user is None and not decoy:
            return JsonResponse(
                {"status": "expired", "detail": "Your signup session expired. Please start signup again."},
                status=400,
            )
        if decoy or user is None:
            return JsonResponse({
                "status": "sent",
                "detail": "A new verification code has been sent to your email.",
                "cooldown_seconds": 60,
            })
        try:
            resend_otp(user)
        except OTPCooldownError as exc:
            return JsonResponse(
                {"status": "cooldown", "detail": f"Please wait {exc.retry_after}s before requesting another code.", "retry_after": exc.retry_after},
                status=429,
            )
        except OTPRateLimitError as exc:
            return JsonResponse(
                {"status": "rate_limited", "detail": "Too many OTP requests. Please wait before trying again.", "retry_after": min(exc.retry_after, 3600)},
                status=429,
            )
        except EmailDeliveryError:
            return JsonResponse(
                {"status": "send_failed", "detail": "We couldn't send the verification code right now. Please try again shortly."},
                status=503,
            )
        return JsonResponse({
            "status": "sent",
            "detail": "A new verification code has been sent to your email.",
            "cooldown_seconds": 60,
        })

    email = data.get("email") or ""
    try:
        resend_password_reset_otp(email)
    except ValidationError:
        return JsonResponse({"detail": "Enter a valid email address."}, status=400)
    except OTPCooldownError as exc:
        return JsonResponse(
            {"status": "cooldown", "detail": f"Please wait {exc.retry_after}s before requesting another code.", "retry_after": exc.retry_after},
            status=429,
        )
    except OTPRateLimitError as exc:
        return JsonResponse(
            {"status": "rate_limited", "detail": "Too many OTP requests. Please wait before trying again.", "retry_after": min(exc.retry_after, 3600)},
            status=429,
        )
    except EmailDeliveryError:
        return JsonResponse(
            {"status": "send_failed", "detail": "We couldn't send the verification code right now. Please try again shortly."},
            status=503,
        )
    return JsonResponse({
        "status": "sent",
        "detail": "If that email has an account, a new code is on its way. It expires in 10 minutes.",
        "cooldown_seconds": 60,
    })


def _google_callback_url(request):
    dynamic_url = request.build_absolute_uri("/api/auth/google/callback/")
    configured = (getattr(settings, "GOOGLE_CALLBACK_URL", "") or "").strip()
    if not configured:
        return dynamic_url

    parsed = urllib.parse.urlparse(configured)
    path = parsed.path or ""
    if path in ("", "/"):
        parsed = parsed._replace(path="/api/auth/google/callback/")

    request_host = request.get_host().split(":")[0].lower()
    configured_host = (parsed.hostname or "").lower()
    if (
        request_host
        and request_host not in {"localhost", "127.0.0.1", "testserver"}
        and configured_host != request_host
    ):
        return dynamic_url

    return urllib.parse.urlunparse(parsed)


def _google_page_for_source(source):
    return "/join.html" if source == "join" else "/login"


def _default_settings_url_for(user):
    role = getattr(user, "role", "")
    if role == "TRAINER":
        return "/trainer/settings"
    if role == "MEMBER":
        return "/dashboard#settings"
    return "/settings"


def _append_query_preserving_hash(url: str, params: dict[str, str]) -> str:
    parsed = urllib.parse.urlparse(url)
    existing = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    for k, v in params.items():
        existing[k] = [v]
    new_query = urllib.parse.urlencode(existing, doseq=True)
    return urllib.parse.urlunparse(parsed._replace(query=new_query))


def _post_google_redirect_for(user):
    if getattr(user, "requires_first_login_gate", False):
        return "/accounts/onboarding/"
    if getattr(user, "role", "") in ("CASHIER", "TRAINER") and not (
        getattr(user, "onboarding_data", None) or {}
    ).get("completed"):
        return "/onboarding"
    return role_home_url(user)


@ensure_csrf_cookie
@require_GET
def google_config_view(request):
    """Public OAuth config exposing only non-secret client_id and callback URL."""
    ensure_google_user_columns()
    return JsonResponse({
        "client_id": (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip(),
        "oauth_redirect_enabled": bool(
            (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip()
            and (getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "").strip()
        ),
        "callback_url": _google_callback_url(request),
        "scopes": GOOGLE_SCOPES,
    })


@require_POST
def google_auth_view(request):
    """POST /api/auth/google/: verify Google credential for linked login or /join Member signup."""
    ensure_google_user_columns()
    data = _json_body(request)
    if data is None:
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
        outcome = authenticate_google_member(claims)
    except GoogleAuthError as exc:
        body = {"detail": exc.message, "code": exc.code}
        if exc.code == "not_linked":
            body["redirect"] = "/login?error=not-linked"
        return JsonResponse(body, status=exc.status_code)
    except DatabaseError as exc:
        _log_google_db_error("sign_in", exc)
        return JsonResponse(
            {"detail": "A database error occurred while signing you in. Please try again.", "code": "db_error"},
            status=503,
        )

    if outcome.status == "link_required":
        return JsonResponse({
            "status": "link_required",
            "email": outcome.email,
            "link_token": outcome.link_token,
            "detail": "An account with this email already exists. Enter your ProFit password to verify and link your Google account.",
        })

    user = outcome.user
    user.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, user)
    return JsonResponse({
        "status": "authenticated",
        "created": outcome.created,
        "role": WEB_ROLE.get(getattr(user, "role", ""), "MEMBER"),
        "redirect": _post_google_redirect_for(user),
        "requires_onboarding_gate": bool(getattr(user, "requires_first_login_gate", False)),
        "user": _session_user_dict(user),
    })


@require_POST
def google_link_view(request):
    """POST /api/auth/google/link/ {link_token, password}: verify password then link Google."""
    ensure_google_user_columns()
    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    try:
        user = verify_and_link_google_account(
            data.get("link_token") or "",
            data.get("password") or "",
        )
    except GoogleAuthError as exc:
        return JsonResponse({"detail": exc.message, "code": exc.code}, status=exc.status_code)
    except DatabaseError as exc:
        _log_google_db_error("link", exc)
        return JsonResponse(
            {"detail": "A database error occurred while linking your account. Please try again.", "code": "db_error"},
            status=503,
        )

    user.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, user)
    return JsonResponse({
        "status": "authenticated",
        "linked": True,
        "role": WEB_ROLE.get(getattr(user, "role", ""), "MEMBER"),
        "redirect": _post_google_redirect_for(user),
        "requires_onboarding_gate": bool(getattr(user, "requires_first_login_gate", False)),
        "user": _session_user_dict(user),
    })


@require_POST
def google_connect_view(request):
    """POST /api/auth/google/connect/: connect Google to an authenticated, active account."""
    ensure_google_user_columns()
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    data = _json_body(request)
    if data is None:
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
        updated = connect_google_account(user, claims)
    except GoogleAuthError as exc:
        return JsonResponse({"detail": exc.message, "code": exc.code}, status=exc.status_code)
    except DatabaseError as exc:
        _log_google_db_error("connect", exc)
        return JsonResponse(
            {"detail": "A database error occurred while connecting Google. Please try again.", "code": "db_error"},
            status=503,
        )

    return JsonResponse({
        "status": "connected",
        "user": _session_user_dict(updated),
    })


@require_POST
def google_disconnect_view(request):
    """POST /api/auth/google/disconnect/: unlink Google unless doing so would lock the user out."""
    ensure_google_user_columns()
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)

    try:
        updated = disconnect_google_account(user)
    except GoogleAuthError as exc:
        return JsonResponse({"detail": exc.message, "code": exc.code}, status=exc.status_code)

    return JsonResponse({
        "status": "disconnected",
        "user": _session_user_dict(updated),
    })


@require_POST
def set_password_view(request):
    """POST /api/auth/set-password/: let a Google-only user set an initial password."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if user.has_usable_password():
        return JsonResponse(
            {"detail": "Your account already has a password. Use Change Password instead."},
            status=400,
        )
    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    new_pw = data.get("new_password")
    confirm_pw = data.get("confirm_password")
    if not isinstance(new_pw, str) or not new_pw:
        return JsonResponse({"detail": "Enter a new password."}, status=400)
    if confirm_pw is not None and new_pw != confirm_pw:
        return JsonResponse({"detail": "Passwords do not match."}, status=400)
    try:
        validate_password(new_pw, user)
    except ValidationError as exc:
        return JsonResponse({"detail": " ".join(exc.messages)}, status=400)

    user.set_password(new_pw)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    update_session_auth_hash(request, user)
    return JsonResponse({"detail": "Password saved.", "user": _session_user_dict(user)})


@require_GET
def google_oauth_login_view(request):
    """GET /api/auth/google/login/: redirect to Google OAuth 2.0 consent screen (login/join/connect)."""
    ensure_google_user_columns()
    raw_source = str(request.GET.get("source") or "login").strip().lower()
    source = raw_source if raw_source in {"login", "join", "connect"} else "login"

    if source == "connect":
        if not request.user.is_authenticated or not request.user.is_active:
            return HttpResponseRedirect("/login")
        default_next = _default_settings_url_for(request.user)
        raw_next = request.GET.get("next") or ""
        safe_next = (
            raw_next
            if raw_next
            and url_has_allowed_host_and_scheme(
                raw_next,
                allowed_hosts={request.get_host()},
                require_https=request.is_secure(),
            )
            else default_next
        )
        request.session["google_oauth_connect_uid"] = request.user.pk
        request.session["google_oauth_connect_next"] = safe_next

    client_id = (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip()
    client_secret = (getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "").strip()
    if not client_id or not client_secret:
        if source == "connect":
            target = request.session.pop("google_oauth_connect_next", _default_settings_url_for(request.user))
            request.session.pop("google_oauth_connect_uid", None)
            return HttpResponseRedirect(_append_query_preserving_hash(target, {"google_error": "not_configured"}))
        return HttpResponseRedirect(f"{_google_page_for_source(source)}?google_error=not_configured")

    state = secrets.token_urlsafe(24)
    request.session["google_oauth_state"] = state
    request.session["google_oauth_source"] = source
    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": _google_callback_url(request),
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "state": state,
        "prompt": "select_account",
    })
    return HttpResponseRedirect(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@require_GET
def google_oauth_callback_view(request):
    """GET /api/auth/google/callback/: verify state + exchange code + dispatch login/join/connect/invite."""
    ensure_google_user_columns()
    raw_source = str(request.session.pop("google_oauth_source", "login") or "login").lower()
    source = raw_source if raw_source in {"login", "join", "connect", "invite"} else "login"
    connect_uid = request.session.pop("google_oauth_connect_uid", None)
    connect_next = request.session.pop("google_oauth_connect_next", "/settings")
    invite_id = request.session.pop("google_oauth_invite_id", None)
    invite_token = request.session.pop("google_oauth_invite_token", "")
    expected_state = request.session.pop("google_oauth_state", None)

    def _error_redirect(code: str, msg: str = ""):
        if source == "connect":
            return HttpResponseRedirect(_append_query_preserving_hash(connect_next, {"google_error": code}))
        if source == "invite" and invite_id and invite_token:
            back = reverse("accounts:accept_invite", kwargs={"invite_id": invite_id, "token": invite_token})
            params = {"google_error": code}
            if msg:
                params["google_msg"] = msg
            return HttpResponseRedirect(f"{back}?{urllib.parse.urlencode(params)}")
        if source == "login" and code == "not_linked":
            return HttpResponseRedirect("/login?error=not-linked")
        page = _google_page_for_source(source)
        params = {"google_error": code}
        if msg:
            params["google_msg"] = msg
        return HttpResponseRedirect(f"{page}?{urllib.parse.urlencode(params)}")

    error = (request.GET.get("error") or "").strip()
    if error:
        return _error_redirect("cancelled" if error == "access_denied" else "oauth_error")

    state = (request.GET.get("state") or "").strip()
    if not expected_state or not state or not hmac.compare_digest(str(expected_state), state):
        return _error_redirect("invalid_state")

    auth_code = (request.GET.get("code") or "").strip()
    try:
        claims = exchange_google_code(auth_code, redirect_uri=_google_callback_url(request))
    except GoogleAuthError as exc:
        return _error_redirect(exc.code, exc.message)

    if source == "connect":
        if not request.user.is_authenticated or request.user.pk != connect_uid:
            return HttpResponseRedirect("/login")
        try:
            connect_google_account(request.user, claims)
        except GoogleAuthError as exc:
            return _error_redirect(exc.code, exc.message)
        except DatabaseError as exc:
            _log_google_db_error("callback_connect", exc)
            return _error_redirect("db_error")
        return HttpResponseRedirect(_append_query_preserving_hash(connect_next, {"google_connected": "1"}))

    if source == "invite":
        if not invite_id or not invite_token:
            return HttpResponseRedirect("/login")
        try:
            user = accept_invite_with_google(
                raw_token=invite_token,
                invite_id=invite_id,
                claims=claims,
            )
        except InviteEmailMismatchError as exc:
            return _error_redirect("invite_email_mismatch", str(exc))
        except InviteGoogleInUseError as exc:
            return _error_redirect("google_sub_in_use", str(exc))
        except InvalidInviteError:
            return _error_redirect("invalid_invite", "This invite link is invalid, expired, or revoked.")
        except GoogleAuthError as exc:
            return _error_redirect(exc.code, exc.message)
        user.backend = "django.contrib.auth.backends.ModelBackend"
        login(request, user)
        return HttpResponseRedirect("/accounts/onboarding/")

    try:
        outcome = authenticate_google_member(claims)
    except GoogleAuthError as exc:
        return _error_redirect("not_linked" if exc.code == "not_linked" else exc.code, exc.message)
    except DatabaseError as exc:
        _log_google_db_error("callback", exc)
        return _error_redirect("db_error")

    if outcome.status == "link_required":
        q = urllib.parse.urlencode({"google_link": outcome.link_token, "email": outcome.email})
        return HttpResponseRedirect(f"{_google_page_for_source(source)}?{q}")

    user = outcome.user
    user.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, user)
    return HttpResponseRedirect(_post_google_redirect_for(user))


def _first_login_otp_cooldown(user) -> int:
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


@require_GET
def onboarding_status_api_view(request):
    """GET /api/auth/onboarding/status/: issue initial OTP if needed and return gate state."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)

    delivery_failed = False
    if getattr(user, "needs_first_login_otp", False):
        try:
            issue_first_login_otp(user, force_resend=False)
        except (OTPCooldownError, OTPRateLimitError):
            pass
        except EmailDeliveryError:
            delivery_failed = True

    return JsonResponse({
        "needs_otp": bool(getattr(user, "needs_first_login_otp", False)),
        "needs_consent": bool(getattr(user, "needs_legal_consent", False)),
        "email": user.email or "",
        "cooldown_seconds": _first_login_otp_cooldown(user) if getattr(user, "needs_first_login_otp", False) else 0,
        "delivery_failed": delivery_failed,
        "redirect": _post_google_redirect_for(user),
    })


@require_POST
def onboarding_otp_verify_api_view(request):
    """POST /api/auth/onboarding/otp/verify/: verify 6-digit FIRST_LOGIN OTP in JSON modal."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)

    if not getattr(user, "needs_first_login_otp", False):
        return JsonResponse({
            "ok": True,
            "needs_consent": bool(getattr(user, "needs_legal_consent", False)),
            "redirect": _post_google_redirect_for(user),
            "user": _session_user_dict(user),
        })

    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    form = VerifyForm({"code": str(data.get("code") or "")})
    if not form.is_valid():
        return JsonResponse(
            {"ok": False, "reason": "bad_code", "detail": "Enter the 6-digit verification code."},
            status=400,
        )

    result = verify_first_login_otp(user, form.cleaned_data["code"])
    if result.ok:
        return JsonResponse({
            "ok": True,
            "needs_consent": bool(getattr(user, "needs_legal_consent", False)),
            "redirect": _post_google_redirect_for(user),
            "user": _session_user_dict(user),
        })

    if result.reason == "capped":
        msg = "Too many wrong attempts. This code is locked — request a new code."
    elif result.reason == "expired":
        msg = "That verification code has expired. Request a new code."
    else:
        msg = "That code is invalid or has expired."
    return JsonResponse({"ok": False, "reason": result.reason, "detail": msg}, status=400)


@require_POST
def onboarding_otp_resend_api_view(request):
    """POST /api/auth/onboarding/otp/resend/: resend FIRST_LOGIN OTP enforcing cooldown & cap."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not getattr(user, "needs_first_login_otp", False):
        return JsonResponse({"status": "done", "detail": "Email already verified."}, status=200)

    try:
        resend_first_login_otp(user)
        return JsonResponse({
            "status": "sent",
            "cooldown_seconds": 60,
            "detail": "A new verification code was sent to your email.",
        })
    except OTPCooldownError as exc:
        return JsonResponse(
            {
                "status": "cooldown",
                "retry_after": exc.retry_after,
                "detail": f"Please wait {exc.retry_after}s before requesting another code.",
            },
            status=429,
        )
    except OTPRateLimitError as exc:
        return JsonResponse(
            {
                "status": "rate_limited",
                "retry_after": min(exc.retry_after, 3600),
                "detail": "Too many code requests. Please wait before trying again.",
            },
            status=429,
        )
    except EmailDeliveryError:
        return JsonResponse(
            {
                "status": "send_failed",
                "detail": "We couldn't send the verification code right now. Try again shortly.",
            },
            status=503,
        )


@require_POST
def onboarding_consent_api_view(request):
    """POST /api/auth/onboarding/consent/: require both ToS & Privacy consent, then unlock dashboard."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if getattr(user, "needs_first_login_otp", False):
        return JsonResponse(
            {"detail": "Verify your email code first.", "code": "otp_required"},
            status=400,
        )

    data = _json_body(request)
    if data is None:
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    if data.get("accept_terms") is not True or data.get("accept_privacy") is not True:
        return JsonResponse(
            {"detail": "You must agree to both the Terms of Service and Privacy Policy."},
            status=400,
        )

    record_legal_consent(user)
    return JsonResponse({
        "ok": True,
        "redirect": _post_google_redirect_for(user),
        "user": _session_user_dict(user),
    })


@require_GET
def activity_log_view(request):
    """GET /api/auth/activity/: per-user timeline of sign-ins, actions, and updates."""
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not user.is_active:
        return JsonResponse({"detail": "Account is deactivated."}, status=403)

    from apps.accounts.activity import get_user_activity

    return JsonResponse(get_user_activity(user))
