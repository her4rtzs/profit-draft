from django.contrib import admin

from .models import Attendance, Enrollment, MemberProfile


@admin.register(MemberProfile)
class MemberProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "membership_status", "date_joined", "expiry_date")
    list_filter = ("membership_status",)


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("member", "start_date", "end_date", "created_by", "created_at")


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("member", "check_in_at", "check_in_date", "recorded_by")
    list_filter = ("check_in_date",)
    readonly_fields = ("check_in_date",)
