from django.contrib import admin

from .models import TransactionRecord


@admin.register(TransactionRecord)
class TransactionRecordAdmin(admin.ModelAdmin):
    list_display = ("pk", "payment", "amount_centavos", "recorded_at")
    readonly_fields = ("recorded_at",)
