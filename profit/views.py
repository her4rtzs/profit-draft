"""Project-level views that don't belong to a single app.

``home`` is the public landing page served at ``/``. It is intentionally
unauthenticated and renders only static marketing/orientation content plus
links into the authenticated surfaces (staff portal, admin). It performs no
database access and exposes no member, payment, or financial data.
"""

from django.conf import settings
from django.http import Http404, HttpResponse, HttpResponseForbidden
from django.shortcuts import render

from apps.membership.models import MemberProfile
from apps.membership.services import (
    NO_MEMBERSHIP_MESSAGE,
    TRIAL_ENDED_MESSAGE,
    TRIAL_PROFILE_ONLY_MESSAGE,
    member_access,
)

PUBLIC_PAGES = frozenset({"welcome", "login", "join", "forgot", "faq", "terms", "privacy"})
OWNER_ONLY_PAGES = frozenset({"reports", "trainers", "cashiers", "announcements"})
CASHIER_OR_OWNER_PAGES = frozenset({"cashier", "payments", "members", "attendance", "index", "profile", "settings", "notifications"})


def _serve_web_page(relative):
    """Return a static web/ page by its path relative to web/, or 404."""
    path = settings.BASE_DIR / "web" / f"{relative}.html"
    if not path.is_file():
        raise Http404
    return HttpResponse(path.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")


def web_page(request, page):
    """Serve a top-level web/ page at an extensionless URL, with RBAC checks for signed-in users."""
    if page in PUBLIC_PAGES:
        return _serve_web_page(page)
    if request.user.is_authenticated:
        from apps.accounts.google_auth import ensure_google_user_columns

        ensure_google_user_columns()
        role = str(getattr(request.user, "role", "")).upper()
        is_active = bool(getattr(request.user, "is_active", False))
        if role == "MEMBER":
            profile = MemberProfile.objects.filter(user=request.user).first()
            state = member_access(profile) if profile is not None else "LOCKED"
            if state == "LOCKED":
                if page in ("member-home", "profile", "onboarding"):
                    return _serve_web_page(page)
                has_trial = profile is not None and profile.trial_ends_at is not None
                return HttpResponseForbidden(
                    TRIAL_ENDED_MESSAGE if has_trial else NO_MEMBERSHIP_MESSAGE
                )
            if state == "TRIAL":
                if page in ("member-home", "profile", "onboarding"):
                    return _serve_web_page(page)
                return HttpResponseForbidden(TRIAL_PROFILE_ONLY_MESSAGE)
        if page in OWNER_ONLY_PAGES:
            if not is_active or role != "OWNER":
                return HttpResponseForbidden("Owner access required.")
        elif page in CASHIER_OR_OWNER_PAGES:
            if not is_active or role not in ("OWNER", "CASHIER"):
                return HttpResponseForbidden("Staff access required.")
    return _serve_web_page(page)


def web_page_group(request, group, page):
    """Serve a grouped web/ page, e.g. /trainer/index -> web/trainer/index.html."""
    return _serve_web_page(f"{group}/{page}")


def home(request):
    """Public landing page. No auth, no DB access."""
    welcome_path = settings.BASE_DIR / "web" / "welcome.html"
    if welcome_path.exists():
        return HttpResponse(welcome_path.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")
    return render(request, "home.html")
