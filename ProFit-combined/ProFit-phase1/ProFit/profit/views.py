"""Project-level views that don't belong to a single app.

``home`` is the public landing page served at ``/``. It is intentionally
unauthenticated and renders only static marketing/orientation content plus
links into the authenticated surfaces (staff portal, admin). It performs no
database access and exposes no member, payment, or financial data.
"""

from django.shortcuts import render


def home(request):
    """Public landing page. No auth, no DB access."""
    return render(request, "home.html")
