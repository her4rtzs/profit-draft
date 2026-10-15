"""Pure send helpers for member-auth email.

These build the subject/body and call ``django.core.mail.send_mail`` with
``fail_silently=False`` so a backend ``EmailDeliveryError`` propagates to the
single service caller that catches it. They persist nothing.

LOGGING POLICY: never log the OTP code, the invite token, or any email address.
"""

from django.conf import settings
from django.core.mail import send_mail

OTP_SUBJECT = "Your ProFit verification code"
INVITE_SUBJECT = "You've been invited to ProFit"


def send_otp_email(user, code):
    """Email ``code`` to ``user``. Never logs the code or the address."""
    body = (
        "Welcome to ProFit!\n\n"
        f"Your verification code is: {code}\n\n"
        "It expires in 10 minutes. If you did not request this, ignore this email."
    )
    html = (
        "<p>Welcome to ProFit!</p>"
        f"<p>Your verification code is: <strong>{code}</strong></p>"
        "<p>It expires in 10 minutes. If you did not request this, "
        "ignore this email.</p>"
    )
    send_mail(
        subject=OTP_SUBJECT,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        html_message=html,
        fail_silently=False,
    )


def send_invite_email(invite, raw_token, accept_url):
    """Email the staff-invite accept link. Never logs the token or address."""
    role_label = invite.get_role_display()
    body = (
        "You've been invited to join ProFit as a "
        f"{role_label}.\n\n"
        f"Set up your account here: {accept_url}\n\n"
        "This link expires in 72 hours and can be used once."
    )
    html = (
        f"<p>You've been invited to join ProFit as a <strong>{role_label}</strong>.</p>"
        f'<p><a href="{accept_url}">Set up your account</a></p>'
        "<p>This link expires in 72 hours and can be used once.</p>"
    )
    send_mail(
        subject=INVITE_SUBJECT,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invite.email],
        html_message=html,
        fail_silently=False,
    )
