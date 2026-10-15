"""Session-auth endpoints for the ProFit web app and its installed/native shells.

Same origin, so cookies work without CORS:
  1. GET  /api/auth/csrf/   sets the ``csrftoken`` cookie.
  2. POST /api/auth/login/  body {"identity": email-or-username, "password"}.
                            ``username`` is still accepted for older clients.
                            The client echoes the cookie in ``X-CSRFToken``.
  3. GET  /api/auth/session/ {"user": {..., "role": ADMIN | TRAINER | MEMBER}} or 401.
  4. POST /api/auth/logout/ ends the session.

These are plain Django views on purpose: CsrfViewMiddleware then enforces CSRF on
the anonymous login POST as well. No business logic lives here.
LOGGING POLICY: never log credentials or PII.
"""

import json

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

# Backend roles -> the three shells the web app routes to.
WEB_ROLE = {"OWNER": "ADMIN", "CASHIER": "ADMIN", "TRAINER": "TRAINER", "MEMBER": "MEMBER"}


@ensure_csrf_cookie
def csrf(request):
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
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid request body."}, status=400)
    if not isinstance(payload, dict):
        return JsonResponse({"detail": "Invalid request body."}, status=400)

    identity = payload.get("identity") or payload.get("username")
    user = authenticate(request, username=_username_for(identity), password=payload.get("password"))
    if user is None:
        return JsonResponse({"detail": "Invalid credentials."}, status=401)

    login(request, user)
    return JsonResponse({"detail": "Logged in.", "role": user.role})


@require_GET
def session_view(request):
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    return JsonResponse({
        "user": {
            "id": user.pk,
            "name": user.get_full_name() or user.username,
            "email": user.email,
            "role": WEB_ROLE.get(user.role, "MEMBER"),
        }
    })


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"detail": "Logged out."})
