from django.contrib import admin

from .models import Payment, Subscription, WebhookEvent


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("member", "amount_centavos", "status", "created_at")
    list_filter = ("status",)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("pk", "subscription", "amount_centavos", "status", "created_at")
    list_filter = ("status",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ("event_id", "status", "received_at")
    list_filter = ("status",)
    readonly_fields = ("received_at",)
