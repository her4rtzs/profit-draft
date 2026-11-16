"""Root URL configuration for the ProFit project."""

from django.contrib import admin
from django.urls import include, path

from apps.billing.webhooks import paymongo_webhook

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("accounts/", include("apps.accounts.urls")),
    path("membership/", include("apps.membership.urls")),
    path("finance/", include("apps.finance.urls")),
    path("webhooks/paymongo/", paymongo_webhook),
]
