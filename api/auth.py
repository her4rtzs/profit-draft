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
import secrets
import urllib.parse

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import DatabaseError
from django.http import HttpResponseRedirect, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from apps.accounts.google_auth import (
    GOOGLE_SCOPES,
    GoogleAuthError,
    authenticate_google_member,
    ensure_google_user_columns,
    exchange_google_code,
    verify_and_link_google_account,
    verify_google_access_token,
    verify_google_id_token,
)
from apps.accounts.validators import validate_real_email

# Backend roles -> the four web portal shells.
WEB_ROLE = {"OWNER": "ADMIN", "CASHIER": "CASHIER", "TRAINER": "TRAINER", "MEMBER": "MEMBER"}


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
    return JsonResponse({
        "detail": "Logged in.",
        "role": user.role,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
    })


def _session_user_dict(user):
    return {
        "id": user.pk,
        "name": user.get_full_name() or user.username,
        "email": user.email,
        "role": WEB_ROLE.get(user.role, "MEMBER"),
        "must_change_password": bool(getattr(user, "must_change_password", False)),
    }


@require_GET
def session_view(request):
    ensure_google_user_columns()
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    return JsonResponse({"user": _session_user_dict(user)})


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
    return "/join.html" if source == "join" else "/login.html"


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
    """POST /api/auth/google/: verify Google ID token or access token and sign in or create Member."""
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
        return JsonResponse({"detail": exc.message, "code": exc.code}, status=exc.status_code)
    except DatabaseError:
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
        "role": "MEMBER",
        "redirect": "member-home.html",
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
    except DatabaseError:
        return JsonResponse(
            {"detail": "A database error occurred while linking your account. Please try again.", "code": "db_error"},
            status=503,
        )

    user.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, user)
    return JsonResponse({
        "status": "authenticated",
        "linked": True,
        "role": "MEMBER",
        "redirect": "member-home.html",
        "user": _session_user_dict(user),
    })


@require_GET
def google_oauth_login_view(request):
    """GET /api/auth/google/login/: redirect to Google OAuth 2.0 consent screen (fallback flow)."""
    ensure_google_user_columns()
    source = "join" if request.GET.get("source") == "join" else "login"
    client_id = (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip()
    client_secret = (getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "").strip()
    if not client_id or not client_secret:
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
    """GET /api/auth/google/callback/: verify state + exchange code + log in Member."""
    ensure_google_user_columns()
    source = "join" if request.session.pop("google_oauth_source", "login") == "join" else "login"
    page = _google_page_for_source(source)
    expected_state = request.session.pop("google_oauth_state", None)

    error = (request.GET.get("error") or "").strip()
    if error:
        code = "cancelled" if error == "access_denied" else "oauth_error"
        return HttpResponseRedirect(f"{page}?google_error={code}")

    state = (request.GET.get("state") or "").strip()
    if not expected_state or not state or not hmac.compare_digest(str(expected_state), state):
        return HttpResponseRedirect(f"{page}?google_error=invalid_state")

    auth_code = (request.GET.get("code") or "").strip()
    try:
        claims = exchange_google_code(auth_code, redirect_uri=_google_callback_url(request))
        outcome = authenticate_google_member(claims)
    except GoogleAuthError as exc:
        q = urllib.parse.urlencode({"google_error": exc.code, "google_msg": exc.message})
        return HttpResponseRedirect(f"{page}?{q}")
    except DatabaseError:
        return HttpResponseRedirect(f"{page}?google_error=db_error")

    if outcome.status == "link_required":
        q = urllib.parse.urlencode({"google_link": outcome.link_token, "email": outcome.email})
        return HttpResponseRedirect(f"{page}?{q}")

    user = outcome.user
    user.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, user)
    return HttpResponseRedirect(f"{page}?google_authenticated=1")
