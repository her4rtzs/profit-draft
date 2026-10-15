"""Staff web URLs for the membership portal."""

from django.urls import path

from . import views

app_name = "membership"

urlpatterns = [
    path("", views.member_list, name="member_list"),
    path("search/", views.member_search, name="member_search"),
    path("<int:pk>/", views.member_detail, name="member_detail"),
]
