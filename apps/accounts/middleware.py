"""Server-side gate blocking dashboards & data APIs until first-login OTP and consent finish."""

from django.http import JsonResponse
from django.shortcuts import redirect

_EXEMPT_EXACT = frozenset({
    "/accounts/logout/",
    "/api/auth/logout/",
    "/api/auth/csrf/",
    "/api/auth/session/",
    "/api/auth/google/config/",
    "/terms",
    "/terms.html",
    "/privacy",
    "/privacy.html",
    "/faq",
    "/faq.html",
    "/manifest.webmanifest",
    "/favicon.ico",
})

_EXEMPT_PREFIXES = (
    "/accounts/onboarding/",
    "/static/",
    "/icons/",
)


class FirstLoginOnboardingGateMiddleware:
    """Enforce first-login OTP verification and ToS/Privacy consent before dashboard access."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated and getattr(user, "requires_first_login_gate", False):
            path = request.path_info or "/"
            if path not in _EXEMPT_EXACT and not path.startswith(_EXEMPT_PREFIXES):
                if path.startswith("/api/"):
                    return JsonResponse(
                        {
                            "detail": "Complete email verification and legal consent before continuing.",
                            "code": "onboarding_required",
                            "redirect": "/accounts/onboarding/",
                        },
                        status=403,
                    )
                return redirect("/accounts/onboarding/")
        return self.get_response(request)
