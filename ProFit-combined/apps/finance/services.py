"""Finance services (Module 3).

Business logic lives here. Money is always integer centavos (PHP 800.00 = 80000).
Prices match the plan list the staff UI shows.
"""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.membership.models import MemberProfile
from apps.membership.services import renew_member

from apps.notifications.models import Notification
from apps.notifications.services import notify
from .models import ManualPayment

PLAN_PRICE_CENTAVOS = {
    "monthly": 80_000,
    "quarterly": 210_000,
    "annual": 750_000,
}


def record_desk_payment(*, member, plan, method, recorded_by, paid_on=None):
    """Record a settled desk payment and renew the membership in one transaction.

    The new period starts on the current expiry when the membership is still
    running, so paying early does not lose the days left. That matches the
    renewal rule in the staff UI. Otherwise it starts today.
    """
    if plan not in PLAN_PRICE_CENTAVOS:
        raise ValidationError("Unknown plan.")
    if method not in ManualPayment.Method.values:
        raise ValidationError("Unknown payment method.")

    today = timezone.localdate()
    with transaction.atomic():
        profile = MemberProfile.objects.select_for_update().get(pk=member.pk)
        start = (
            profile.expiry_date
            if profile.expiry_date and profile.expiry_date >= today
            else today
        )
        payment = ManualPayment.objects.create(
            member=profile,
            plan=plan,
            method=method,
            amount_centavos=PLAN_PRICE_CENTAVOS[plan],
            paid_on=paid_on or today,
            recorded_by=recorded_by,
        )
        renew_member(profile, plan, created_by=recorded_by, start_date=start)
        profile.refresh_from_db()
        notify(
            profile.user,
            "Membership renewed",
            kind=Notification.Kind.MEMBERSHIP,
            body=f"Your {plan} plan is active until {profile.expiry_date:%b %d, %Y}.",
            link="member-home.html",
        )
    return payment


def monthly_summary(year, month):
    """Totals for one calendar month: desk payments plus PAID online payments."""
    from apps.billing.models import Payment as OnlinePayment

    desk = ManualPayment.objects.filter(paid_on__year=year, paid_on__month=month)
    online = OnlinePayment.objects.filter(
        status=OnlinePayment.Status.PAID,
        created_at__year=year,
        created_at__month=month,
    )

    desk_total = desk.aggregate(t=Sum("amount_centavos"))["t"] or 0
    online_total = online.aggregate(t=Sum("amount_centavos"))["t"] or 0

    by_method = {
        row["method"]: row["total"]
        for row in desk.values("method").annotate(total=Sum("amount_centavos"))
    }
    if online_total:
        by_method["ONLINE"] = online_total

    by_plan = {
        row["plan"]: row["total"]
        for row in desk.values("plan").annotate(total=Sum("amount_centavos"))
    }

    return {
        "year": year,
        "month": month,
        "total_centavos": desk_total + online_total,
        "desk_centavos": desk_total,
        "online_centavos": online_total,
        "payment_count": desk.count() + online.count(),
        "by_method": by_method,
        "by_plan": by_plan,
    }
