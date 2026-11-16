"""Project-level views that don't belong to a single app.

``home`` is the public landing page served at ``/``. It is intentionally
unauthenticated and renders only static marketing/orientation content plus
links into the authenticated surfaces (staff portal, admin). It performs no
database access and exposes no member, payment, or financial data.
"""

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.templatetags.static import static


def home(request):
    """Public landing page. No auth, no DB access."""
    welcome_path = settings.BASE_DIR / "web" / "welcome.html"
    if welcome_path.exists():
        return HttpResponse(welcome_path.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")
    return render(request, "home.html")


def manifest(request):
    """Web app manifest. Public on purpose: phones fetch it without a login."""
    data = {
        "id": "/",
        "name": "ProFit",
        "short_name": "ProFit",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        # One launch background for every scheme; a dark phone may briefly show a light splash.
        "theme_color": "#f0f2f5",
        "background_color": "#f0f2f5",
        "icons": [
            {"src": static("icons/icon-192.png"), "sizes": "192x192", "type": "image/png"},
            {"src": static("icons/icon-512.png"), "sizes": "512x512", "type": "image/png"},
            {
                "src": static("icons/maskable-icon-512.png"),
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }
    return JsonResponse(data, content_type="application/manifest+json")
