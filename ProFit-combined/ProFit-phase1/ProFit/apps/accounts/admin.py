from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import EmailOTP, StaffInvite, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Admin for the custom user, exposing the role field."""

    fieldsets = DjangoUserAdmin.fieldsets + (("Role", {"fields": ("role",)}),)
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (("Role", {"fields": ("role",)}),)
    list_display = DjangoUserAdmin.list_display + ("role",)
    list_filter = DjangoUserAdmin.list_filter + ("role",)


@admin.register(EmailOTP)
class EmailOTPAdmin(admin.ModelAdmin):
    """View-only audit surface for issued OTPs. The hash is never exposed."""

    list_display = (
        "user",
        "purpose",
        "created_at",
        "expires_at",
        "consumed_at",
        "attempts",
    )
    readonly_fields = (
        "user",
        "purpose",
        "created_at",
        "expires_at",
        "consumed_at",
        "attempts",
    )
    exclude = ("code_hash",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(StaffInvite)
class StaffInviteAdmin(admin.ModelAdmin):
    """View-only audit surface for invites. The token hash is never exposed.

    ``email`` is shown as a deliberately-scoped, Owner-gated admin exception; it
    is still never written to application logs.
    """

    list_display = (
        "email",
        "role",
        "created_at",
        "expires_at",
        "used_at",
        "invited_by",
    )
    readonly_fields = (
        "email",
        "role",
        "invited_by",
        "created_at",
        "expires_at",
        "used_at",
        "accepted_user",
    )
    exclude = ("token_hash",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
