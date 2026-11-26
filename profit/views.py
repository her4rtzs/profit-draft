"""Project-level views, unified /dashboard dispatch, and strict portal RBAC.

``home`` is the public landing page served at ``/``. Every portal HTML page
(clean URL or ``.html``) is routed through Django so authentication and role
checks run on the server before any HTML is returned.
"""

from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.http import Http404, HttpResponse
from django.shortcuts import redirect, render

from apps.accounts.google_auth import ensure_google_user_columns
from apps.membership.models import MemberProfile
from apps.membership.services import (
    NO_MEMBERSHIP_MESSAGE,
    TRIAL_ENDED_MESSAGE,
    TRIAL_PROFILE_ONLY_MESSAGE,
    member_access,
)

PORTAL_LOGIN_URL = "/login"

PUBLIC_PAGES = frozenset({"welcome", "login", "join", "forgot", "faq", "terms", "privacy"})
LEGACY_HOME_ROLE = {
    "index": "OWNER",
    "cashier": "CASHIER",
    "member-home": "MEMBER",
    "trainer-portal": "TRAINER",
}
OWNER_ONLY_PAGES = frozenset({"reports", "trainers", "cashiers", "announcements"})
STAFF_SHARED_PAGES = frozenset({"payments", "members", "attendance", "settings", "notifications"})
MEMBER_ONLY_PAGES = frozenset({"claim"})
TRAINER_PAGES = frozenset({
    "members",
    "attendance",
    "schedule",
    "announcements",
    "notifications",
    "profile",
    "settings",
})
ONBOARDING_ROLES = frozenset({"CASHIER", "TRAINER", "MEMBER"})


def _serve_web_page(relative):
    """Return a static web/ page by its path relative to web/, or 404."""
    path = settings.BASE_DIR / "web" / f"{relative}.html"
    if not path.is_file():
        raise Http404
    return HttpResponse(path.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")


DEFAULT_PORTAL_NOT_FOUND_MSG = "The URL you entered doesn't exist or isn't available for your account."


def _portal_not_found_forbidden(request, message=None, heading="Page not found", eyebrow="ProFit · Page not found"):
    """Render a branded ProFit 403 error page that avoids leaking restricted role URLs."""
    return render(
        request,
        "errors/portal_error.html",
        {
            "heading": heading,
            "eyebrow": eyebrow,
            "message": message or DEFAULT_PORTAL_NOT_FOUND_MSG,
        },
        status=403,
    )


def error_404(request, exception=None):
    """Render branded ProFit 404 Page not found view."""
    return render(
        request,
        "errors/portal_error.html",
        {
            "heading": "Page not found",
            "eyebrow": "ProFit · Page not found",
            "message": DEFAULT_PORTAL_NOT_FOUND_MSG,
        },
        status=404,
    )


def error_403(request, exception=None):
    """Render branded ProFit 403 error view without exposing internal route structure."""
    return _portal_not_found_forbidden(request)


def _role_of(user) -> str:
    return str(getattr(user, "role", "")).upper()


def _is_active_user(user) -> bool:
    return bool(user is not None and getattr(user, "is_authenticated", False) and getattr(user, "is_active", False))


def resolve_post_login_redirect(user, raw_next: str | None) -> str:
    """Return raw_next (normalized to /dashboard for role homes) only if user's role may open it."""
    if not raw_next or not _is_active_user(user):
        return "/dashboard"
    parsed = urlsplit(raw_next)
    path = parsed.path or "/"
    role = _role_of(user)

    normalized = path[:-5] if path.lower().endswith(".html") else path
    if normalized != "/" and normalized.endswith("/"):
        stripped = normalized.rstrip("/")
    else:
        stripped = normalized

    if stripped in ("/dashboard", "/index", "/cashier", "/member-home", "/trainer/index", "/trainer-portal"):
        allowed_home = {
            "/dashboard": role in ("OWNER", "CASHIER", "TRAINER", "MEMBER"),
            "/index": role == "OWNER",
            "/cashier": role == "CASHIER",
            "/member-home": role == "MEMBER",
            "/trainer/index": role == "TRAINER",
            "/trainer-portal": role == "TRAINER",
        }[stripped]
        if not allowed_home:
            return "/dashboard"
        return urlunsplit(("", "", "/dashboard", parsed.query, parsed.fragment))

    slug = stripped.lstrip("/")
    if "/" not in slug:
        if slug in PUBLIC_PAGES:
            return raw_next
        if slug in OWNER_ONLY_PAGES:
            return raw_next if role == "OWNER" else "/dashboard"
        if slug in STAFF_SHARED_PAGES:
            return raw_next if role in ("OWNER", "CASHIER") else "/dashboard"
        if slug in MEMBER_ONLY_PAGES:
            return raw_next if role == "MEMBER" else "/dashboard"
        if slug == "profile":
            return raw_next if role in ("OWNER", "CASHIER", "MEMBER") else "/dashboard"
        if slug == "onboarding":
            return raw_next if role in ONBOARDING_ROLES else "/dashboard"
        return "/dashboard"

    if stripped.startswith("/trainer/"):
        sub = stripped[len("/trainer/"):]
        if sub in TRAINER_PAGES and role == "TRAINER":
            return raw_next
        return "/dashboard"

    if stripped.startswith("/finance/"):
        return raw_next if role == "OWNER" else "/dashboard"
    if stripped.startswith("/membership/"):
        return raw_next if role in ("OWNER", "CASHIER") else "/dashboard"
    if stripped.startswith("/accounts/"):
        return raw_next

    return "/dashboard"


def dashboard(request):
    """Serve the single /dashboard route dispatched strictly by authenticated user role."""
    if not request.user.is_authenticated:
        return redirect_to_login("/dashboard", PORTAL_LOGIN_URL)
    ensure_google_user_columns()
    if not _is_active_user(request.user):
        return _portal_not_found_forbidden(
            request,
            message="This account is inactive. Please contact the gym administrator.",
            heading="Account inactive",
            eyebrow="ProFit · Access notice",
        )
    role = _role_of(request.user)
    if role == "OWNER":
        return _serve_web_page("index")
    if role == "CASHIER":
        return _serve_web_page("cashier")
    if role == "TRAINER":
        return _serve_web_page("trainer/index")
    if role == "MEMBER":
        return _serve_web_page("member-home")
    return _portal_not_found_forbidden(request)


def web_page(request, page):
    """Serve a top-level web/ page at an extensionless URL with strict RBAC."""
    if page == "member-portal":
        return redirect("/join")
    if page == "login":
        if request.user.is_authenticated and not getattr(request.user, "requires_first_login_gate", False):
            return redirect("/dashboard")
        return _serve_web_page("login")
    if page in PUBLIC_PAGES:
        return _serve_web_page(page)

    known_protected = (
        page in LEGACY_HOME_ROLE
        or page in OWNER_ONLY_PAGES
        or page in STAFF_SHARED_PAGES
        or page in MEMBER_ONLY_PAGES
        or page in ("profile", "onboarding")
    )
    if not known_protected or not (settings.BASE_DIR / "web" / f"{page}.html").is_file():
        raise Http404

    if not request.user.is_authenticated:
        return redirect_to_login(request.get_full_path(), PORTAL_LOGIN_URL)

    ensure_google_user_columns()
    if not _is_active_user(request.user):
        return _portal_not_found_forbidden(
            request,
            message="This account is inactive. Please contact the gym administrator.",
            heading="Account inactive",
            eyebrow="ProFit · Access notice",
        )
    role = _role_of(request.user)

    if page in LEGACY_HOME_ROLE:
        expected = LEGACY_HOME_ROLE[page]
        if role != expected:
            return _portal_not_found_forbidden(request)
        return redirect("/dashboard")

    if role == "MEMBER":
        profile = MemberProfile.objects.filter(user=request.user).first()
        state = member_access(profile) if profile is not None else "LOCKED"
        if page in ("profile", "onboarding", "claim"):
            return _serve_web_page(page)
        if state == "LOCKED":
            has_trial = profile is not None and profile.trial_ends_at is not None
            return _portal_not_found_forbidden(
                request,
                message=TRIAL_ENDED_MESSAGE if has_trial else NO_MEMBERSHIP_MESSAGE,
                heading="Membership required",
                eyebrow="ProFit · Membership notice",
            )
        if state == "TRIAL":
            return _portal_not_found_forbidden(
                request,
                message=TRIAL_PROFILE_ONLY_MESSAGE,
                heading="Trial account limit",
                eyebrow="ProFit · Membership notice",
            )
        return _portal_not_found_forbidden(request)

    if page == "onboarding":
        if role == "OWNER":
            return redirect("/dashboard")
        if role in ONBOARDING_ROLES:
            return _serve_web_page("onboarding")
        return _portal_not_found_forbidden(request)

    if page in MEMBER_ONLY_PAGES:
        return _portal_not_found_forbidden(request)

    if page in OWNER_ONLY_PAGES:
        if role != "OWNER":
            return _portal_not_found_forbidden(request)
        return _serve_web_page(page)

    if page in STAFF_SHARED_PAGES or page == "profile":
        if role not in ("OWNER", "CASHIER"):
            return _portal_not_found_forbidden(request)
        return _serve_web_page(page)

    raise Http404


def web_page_group(request, group, page):
    """Serve a grouped web/ page, e.g. /trainer/attendance -> web/trainer/attendance.html."""
    if group != "trainer" or (page != "index" and page not in TRAINER_PAGES):
        raise Http404
    if not (settings.BASE_DIR / "web" / f"{group}/{page}.html").is_file():
        raise Http404
    if not request.user.is_authenticated:
        return redirect_to_login(request.get_full_path(), PORTAL_LOGIN_URL)
    ensure_google_user_columns()
    if not _is_active_user(request.user) or _role_of(request.user) != "TRAINER":
        return _portal_not_found_forbidden(request)
    if page == "index":
        return redirect("/dashboard")
    return _serve_web_page(f"{group}/{page}")


def web_page_html(request, page):
    """Handle direct .html requests safely under the same RBAC policy."""
    if page == "member-portal":
        return redirect("/join")
    if page in PUBLIC_PAGES:
        return redirect(f"/{page}")
    response = web_page(request, page)
    if response.status_code == 200:
        return redirect(f"/{page}")
    return response


def web_page_group_html(request, group, page):
    """Handle direct grouped .html requests safely under the same RBAC policy."""
    response = web_page_group(request, group, page)
    if response.status_code == 200:
        return redirect(f"/{group}/{page}")
    return response


def home(request):
    """Public landing page. No auth, no DB access."""
    welcome_path = settings.BASE_DIR / "web" / "welcome.html"
    if welcome_path.exists():
        return HttpResponse(welcome_path.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")
    return render(request, "home.html")
