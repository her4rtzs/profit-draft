"""Root URL configuration for the ProFit project."""

from django.contrib import admin
from django.urls import include, path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("accounts/", include("apps.accounts.urls")),
    path("membership/", include("apps.membership.urls")),
    path("finance/", include("apps.finance.urls")),
    path("dashboard", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard),
    # Redirect or block direct .html requests so portal RBAC applies uniformly.
    path("<slug:group>/<slug:page>.html", views.web_page_group_html, name="web-page-group-html"),
    path("<slug:page>.html", views.web_page_html, name="web-page-html"),
    # Clean, extensionless URLs for the static web/ pages. Keep these last so
    # they cannot shadow the real routes above.
    path("<slug:group>/<slug:page>", views.web_page_group, name="web-page-group"),
    path("<slug:page>", views.web_page, name="web-page"),
]
