"""Pure send helpers for member-auth email.

These build clean transactional plain-text + HTML emails and send via
``EmailMultiAlternatives`` with ``fail_silently=False`` so a backend
``EmailDeliveryError`` propagates to the single service caller that catches it.
They persist nothing.

LOGGING POLICY: never log the OTP code, the invite token, or any email address.
"""

from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

OTP_SUBJECT = "Your ProFit verification code"
INVITE_SUBJECT = "You've been invited to ProFit"
RESET_SUBJECT = "Your ProFit password reset code"

_TRANSACTIONAL_HEADERS = {
    "Auto-Submitted": "auto-generated",
    "X-Auto-Response-Suppress": "All",
}


def _reply_to_list():
    configured = getattr(settings, "DEFAULT_REPLY_TO_EMAIL", "") or ""
    if configured.strip():
        return [configured.strip()]
    sender = (getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
    if sender and "onboarding@resend.dev" not in sender.lower():
        return [sender]
    return []


def _code_email_html(*, heading: str, intro: str, code: str, footer_note: str) -> str:
    safe_heading = escape(heading)
    safe_intro = escape(intro)
    safe_code = escape(str(code))
    safe_note = escape(footer_note)
    return (
        "<!doctype html>"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{safe_heading}</title></head>"
        '<body style="margin:0;padding:24px 12px;background-color:#f4f5f8;'
        'font-family:Inter,Segoe UI,Arial,sans-serif;color:#111318;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="max-width:520px;margin:0 auto;background:#ffffff;'
        'border:1px solid #e2e6ef;border-radius:12px;overflow:hidden;">'
        '<tr><td style="padding:20px 24px;background:#0b0c10;color:#f6efdc;'
        'font-size:18px;font-weight:700;letter-spacing:-0.01em;">'
        'ProFit <span style="color:#e8b93a;font-weight:600;font-size:13px;">'
        "&middot; Functional Fitness Gym</span></td></tr>"
        '<tr><td style="padding:24px;">'
        f'<h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#111318;">{safe_heading}</h1>'
        f'<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#3d4352;">{safe_intro}</p>'
        '<div style="margin:0 0 18px;padding:16px;text-align:center;'
        'background:#f7f8fb;border:1px solid #d8dce6;border-radius:10px;">'
        f'<span style="font-size:30px;font-weight:700;letter-spacing:8px;'
        f'color:#111318;font-family:Consolas,Menlo,monospace;">{safe_code}</span>'
        "</div>"
        f'<p style="margin:0;font-size:13px;line-height:1.6;color:#5b6070;">{safe_note}</p>'
        "</td></tr>"
        '<tr><td style="padding:14px 24px;border-top:1px solid #eceff5;'
        'font-size:12px;color:#6b7280;">'
        "Functional Fitness Gym &middot; Alfonso, Calabarzon<br>"
        "This is an automated security email from ProFit."
        "</td></tr>"
        "</table></body></html>"
    )


def _send_transactional(*, subject: str, body: str, html: str, recipient: str) -> None:
    msg = EmailMultiAlternatives(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
        reply_to=_reply_to_list(),
        headers=dict(_TRANSACTIONAL_HEADERS),
    )
    msg.attach_alternative(html, "text/html")
    msg.send(fail_silently=False)


def send_otp_email(user, code):
    """Email ``code`` to ``user``. Never logs the code or the address."""
    body = (
        "Welcome to ProFit (Functional Fitness Gym).\n\n"
        f"Your verification code is: {code}\n\n"
        "This code expires in 10 minutes. If you did not request this, "
        "you can safely ignore this email."
    )
    html = _code_email_html(
        heading="Verify your ProFit account",
        intro="Enter the 6-digit verification code below to confirm your email address.",
        code=code,
        footer_note="This code expires in 10 minutes. If you did not request this, you can safely ignore this email.",
    )
    _send_transactional(
        subject=OTP_SUBJECT,
        body=body,
        html=html,
        recipient=user.email,
    )


def send_invite_email(invite, raw_token, accept_url):
    """Email the staff-invite accept link. Never logs the token or address."""
    role_label = invite.get_role_display()
    safe_role = escape(role_label)
    safe_url = escape(accept_url)
    body = (
        f"You've been invited to join ProFit as a {role_label}.\n\n"
        f"Set up your account here: {accept_url}\n\n"
        "This link expires in 72 hours and can be used once."
    )
    html = (
        "<!doctype html>"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(INVITE_SUBJECT)}</title></head>"
        '<body style="margin:0;padding:24px 12px;background-color:#f4f5f8;'
        'font-family:Inter,Segoe UI,Arial,sans-serif;color:#111318;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="max-width:520px;margin:0 auto;background:#ffffff;'
        'border:1px solid #e2e6ef;border-radius:12px;overflow:hidden;">'
        '<tr><td style="padding:20px 24px;background:#0b0c10;color:#f6efdc;'
        'font-size:18px;font-weight:700;">ProFit '
        '<span style="color:#e8b93a;font-weight:600;font-size:13px;">'
        "&middot; Functional Fitness Gym</span></td></tr>"
        '<tr><td style="padding:24px;">'
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">You\'ve been invited to join ProFit as a <strong>{safe_role}</strong>.</p>'
        f'<p style="margin:0 0 18px;"><a href="{safe_url}" style="display:inline-block;padding:12px 20px;background:#e8b93a;color:#1a1407;text-decoration:none;font-weight:700;border-radius:999px;">Set up your account</a></p>'
        '<p style="margin:0;font-size:13px;color:#5b6070;">This link expires in 72 hours and can be used once.</p>'
        "</td></tr>"
        '<tr><td style="padding:14px 24px;border-top:1px solid #eceff5;font-size:12px;color:#6b7280;">'
        "Functional Fitness Gym &middot; Alfonso, Calabarzon"
        "</td></tr></table></body></html>"
    )
    _send_transactional(
        subject=INVITE_SUBJECT,
        body=body,
        html=html,
        recipient=invite.email,
    )


def send_reset_email(user, code):
    """Email a password-reset ``code``. Never logs the code or the address."""
    body = (
        "We received a request to reset your ProFit password.\n\n"
        f"Your reset code is: {code}\n\n"
        "This code expires in 10 minutes. If you did not request this, "
        "ignore this email and your password will stay the same."
    )
    html = _code_email_html(
        heading="Reset your ProFit password",
        intro="Use the 6-digit code below to verify your identity before choosing a new password.",
        code=code,
        footer_note="This code expires in 10 minutes. If you did not request this, ignore this email and your password will stay the same.",
    )
    _send_transactional(
        subject=RESET_SUBJECT,
        body=body,
        html=html,
        recipient=user.email,
    )
