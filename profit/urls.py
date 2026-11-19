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
    # Clean, extensionless URLs for the static web/ pages. Keep these last so
    # they cannot shadow the real routes above. WHITENOISE_ROOT still serves
    # the .html files directly, but every internal link now uses these URLs.
    path("<slug:group>/<slug:page>", views.web_page_group, name="web-page-group"),
    path("<slug:page>", views.web_page, name="web-page"),
]
