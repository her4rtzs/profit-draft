"""Finance web views (Module 3).

The dashboard is an Owner-only placeholder shell, gated by the shared RBAC
policy via the ``role_required`` adapter. It proves the access gate works even
though there is no reporting data yet; no business logic lives here.
"""

from django.shortcuts import render

from apps.accounts.adapters import role_required
from apps.accounts.permissions import can_view_financials


@role_required(can_view_financials)
def financial_dashboard(request):
    """Owner-only financial dashboard placeholder shell."""
    return render(request, "finance/dashboard.html", {})
