"""Billing services (Module 2).

The payment gateway is gone. These helpers only maintain the status of old
``Payment`` rows kept for history; nothing here calls an external API.
"""

from django.utils import timezone

from apps.membership.models import MemberProfile
from apps.membership.services import renew_member
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import Payment, Subscription


def mark_payment_paid(payment):
    """Mark a historical payment PAID; a settled payment is left untouched."""
    if payment.status in (Payment.Status.PAID, Payment.Status.FAILED):
        return payment
    payment.status = Payment.Status.PAID
    payment.updated_at = timezone.now()
    payment.save(update_fields=["status", "updated_at"])
    return payment


def mark_payment_failed(payment):
    """Mark a historical payment FAILED; a settled payment is left untouched."""
    if payment.status in (Payment.Status.PAID, Payment.Status.FAILED):
        return payment
    payment.status = Payment.Status.FAILED
    payment.updated_at = timezone.now()
    payment.save(update_fields=["status", "updated_at"])
    return payment


def activate_paid_payment(payment):
    """Activate the membership for an already-settled historical payment.

    Paying early keeps the days left on the current membership.
    """
    sub = payment.subscription
    member = MemberProfile.objects.select_for_update().get(pk=sub.member_id)
    today = timezone.localdate()
    start = member.expiry_date if member.expiry_date and member.expiry_date >= today else today
    if sub.plan:
        renew_member(member, sub.plan, created_by=member.user, start_date=start)
    sub.status = Subscription.Status.ACTIVE
    sub.save(update_fields=["status", "updated_at"])
    member.refresh_from_db()
    if member.user_id:
        body = (
            f"Your {sub.plan} plan is active until {member.expiry_date:%b %d, %Y}."
            if sub.plan and member.expiry_date
            else "Your ProFit membership is now active."
        )
        notify(
            member.user,
            "Membership active",
            kind=Notification.Kind.MEMBERSHIP,
            body=body,
            link="member-home.html",
        )
