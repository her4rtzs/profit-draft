"""Project-level views that don't belong to a single app.

``home`` is the public landing page served at ``/``. It is intentionally
unauthenticated and renders only static marketing/orientation content plus
links into the authenticated surfaces (staff portal, admin). It performs no
database access and exposes no member, payment, or financial data.
"""

from django.conf import settings
from django.http import Http404, HttpResponse
from django.shortcuts import render


def _serve_web_page(relative):
    """Return a static web/ page by its path relative to web/, or 404."""
    path = settings.BASE_DIR / "web" / f"{relative}.html"
    if not path.is_file():
        raise Http404
    return HttpResponse(path.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")


def web_page(request, page):
    """Serve a top-level web/ page at an extensionless URL, e.g. /members."""
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
