"""Project-level views that don't belong to a single app.

``home`` is the public landing page served at ``/``. It is intentionally
unauthenticated and renders only static marketing/orientation content plus
links into the authenticated surfaces (staff portal, admin). It performs no
database access and exposes no member, payment, or financial data.
"""

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render


def home(request):
    """Public landing page. No auth, no DB access."""
    welcome_path = settings.BASE_DIR / "web" / "welcome.html"
    if welcome_path.exists():
        return HttpResponse(welcome_path.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")
    return render(request, "home.html")
