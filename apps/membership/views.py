"""Minimal staff web views for the membership portal.

Access is gated by the shared RBAC policy via the ``role_required`` adapter;
these views only render templates and call into services — no business logic
lives here. The member-list page demonstrates the django-component + HTMX
partial pattern.
"""

from django.shortcuts import get_object_or_404, render

from apps.accounts.adapters import role_required
from apps.accounts.permissions import can_manage_enrollment, can_view_attendance

from .models import MemberProfile


def _search_members(query):
    """Return member profiles filtered by an optional username query."""
    members = MemberProfile.objects.select_related("user").order_by("user__username")
    if query:
        members = members.filter(user__username__icontains=query)
    return members


@role_required(can_manage_enrollment)
def member_list(request):
    """Staff member list (Owner/Cashier). Hosts the HTMX search box."""
    members = _search_members(request.GET.get("q", "").strip())
    return render(request, "membership/member_list.html", {"members": members})


@role_required(can_manage_enrollment)
def member_search(request):
    """HTMX endpoint returning the member-rows partial for live search."""
    members = _search_members(request.GET.get("q", "").strip())
    return render(request, "membership/_member_rows.html", {"members": members})


@role_required(can_view_attendance)
def member_detail(request, pk):
    """Staff member detail (Owner/Cashier/Trainer), including attendance."""
    member = get_object_or_404(
        MemberProfile.objects.select_related("user"), pk=pk
    )
    attendances = member.attendances.order_by("-check_in_date")
    return render(
        request,
        "membership/member_detail.html",
        {"member": member, "attendances": attendances},
    )
