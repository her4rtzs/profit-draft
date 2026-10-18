"""Business logic for member authentication and staff invites.

Views call these; services own transactions and invariants. Logic lives here,
not in views/serializers (per AGENTS.md).

LOGGING POLICY: never log the OTP code, the invite token, email addresses, or
any other PII. Only the ``capped`` verify outcome is logged, and only the user
id (never the code).
"""

import logging
import secrets
from dataclasses import dataclass

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from .emails import send_otp_email, send_reset_email
from .models import EmailOTP, OTPPurpose, Role, StaffInvite, User
from .permissions import can_manage_staff_invites

logger = logging.getLogger("apps.accounts.services")

# Longest email that can be stored as ``username`` (AbstractUser max_length).
MAX_EMAIL_LENGTH = 150


class EmailDeliveryError(Exception):
    """Raised when an email backend cannot deliver a message.

    Canonical home (imported lazily by ``email_backends.ResendEmailBackend``).
    """


class OTPCooldownError(Exception):
    """Raised when a resend is requested within the cooldown window."""


class InvalidInviteError(Exception):
    """Raised when a staff-invite token/link is invalid, expired, or used."""


@dataclass(frozen=True)
class RegisterResult:
    """Outcome of ``register_member`` handed to the view (never the raw code)."""

    pending_user_id: int | None
    decoy: bool = False
    delivery_failed: bool = False


@dataclass(frozen=True)
class VerifyResult:
    """Outcome of ``verify_otp``.

    ``reason`` is one of: ok, bad_code, expired, consumed, capped, no_pending.
    """

    ok: bool
    reason: str


def normalize_email(email: str) -> str:
    """Single source of truth for mapping an email to the stored username."""
    return email.strip().lower()


# --- Signup / OTP ----------------------------------------------------------


def register_member(email: str, password: str) -> RegisterResult:
    """Register (or re-issue to) an inactive Member and issue a SIGNUP OTP.

    Returns an observably identical result across all branches so the signup
    response cannot be used to enumerate accounts. The caller (view) sends the
    OTP for a real new/inactive user; a decoy (already-active email) sends none.
    """
    validate_email(email)
    norm = normalize_email(email)
    if len(norm) > MAX_EMAIL_LENGTH:
        raise ValidationError("Could not create account.")

    existing = User.objects.filter(email__iexact=norm).first()
    if existing is None:
        try:
            with transaction.atomic():
                user = User(
                    username=norm,
                    email=norm,
                    role=Role.MEMBER,
                    is_active=False,
                )
                validate_password(password, user)
                user.set_password(password)
                user.save()
        except IntegrityError:
            # Concurrent/duplicate-username race: re-read and fall through to
            # the generic path below (branch 2 or 3). Never a 500.
            existing = User.objects.filter(username=norm).first()
            if existing is None:
                # Vanishingly unlikely; treat as a generic decoy.
                return RegisterResult(pending_user_id=None, decoy=True)
        else:
            code = issue_otp(user, OTPPurpose.SIGNUP)
            try:
                send_otp_email(user, code)
            except EmailDeliveryError:
                # The inactive user row persists; let the member resend from
                # the verify page. Never a 500.
                return RegisterResult(pending_user_id=user.id, delivery_failed=True)
            return RegisterResult(pending_user_id=user.id)

    if not existing.is_active:
        # Legitimate re-signup: re-issue to the same user (cooldown may suppress
        # the mail, which is still a generic response).
        try:
            code = issue_otp(existing, OTPPurpose.SIGNUP)
        except OTPCooldownError:
            return RegisterResult(pending_user_id=existing.id)
        try:
            send_otp_email(existing, code)
        except EmailDeliveryError:
            return RegisterResult(pending_user_id=existing.id, delivery_failed=True)
        return RegisterResult(pending_user_id=existing.id)

    # Already active: decoy. No user created, no mail sent.
    return RegisterResult(pending_user_id=None, decoy=True)


def issue_otp(user, purpose) -> str:
    """PERSIST ONLY: enforce cooldown, generate, hash, store, return raw code.

    Never sends mail; never logs the code.
    """
    now = timezone.now()
    latest = (
        EmailOTP.objects.filter(user=user, purpose=purpose)
        .order_by("-created_at")
        .first()
    )
    if latest is not None and now - latest.created_at < EmailOTP.RESEND_COOLDOWN:
        raise OTPCooldownError("Please wait before requesting another code.")

    code = f"{secrets.randbelow(1_000_000):06d}"
    EmailOTP.objects.create(
        user=user,
        code_hash=make_password(code),
        purpose=purpose,
        created_at=now,
        expires_at=now + EmailOTP.TTL,
    )
    return code


def verify_otp(user, code) -> VerifyResult:
    """Verify ``code`` against the latest SIGNUP OTP for ``user``.

    Never raises on an ordinary outcome. On success: consume + activate. Only
    the ``capped`` outcome is logged (user id only).
    """
    now = timezone.now()
    with transaction.atomic():
        row = (
            EmailOTP.objects.select_for_update()
            .filter(user=user, purpose=OTPPurpose.SIGNUP)
            .order_by("-created_at")
            .first()
        )
        if row is None:
            return VerifyResult(ok=False, reason="no_pending")
        if row.is_consumed():
            return VerifyResult(ok=False, reason="consumed")
        if row.is_expired(now):
            return VerifyResult(ok=False, reason="expired")
        if row.attempts >= EmailOTP.MAX_ATTEMPTS:
            return VerifyResult(ok=False, reason="capped")

        if check_password(code, row.code_hash):
            row.consumed_at = now
            row.save(update_fields=["consumed_at"])
            user.is_active = True
            user.save(update_fields=["is_active"])
            return VerifyResult(ok=True, reason="ok")

        row.attempts += 1
        row.save(update_fields=["attempts"])
        if row.attempts >= EmailOTP.MAX_ATTEMPTS:
            logger.info("event=otp_attempts_exceeded user_id=%s", user.id)
            return VerifyResult(ok=False, reason="capped")
        return VerifyResult(ok=False, reason="bad_code")


def resend_otp(user):
    """Re-issue and send a SIGNUP OTP. Catches no exception; the view maps them.

    Raises ``OTPCooldownError`` when still cooling down and ``EmailDeliveryError``
    when the backend cannot deliver.
    """
    code = issue_otp(user, OTPPurpose.SIGNUP)
    send_otp_email(user, code)


# --- Password reset ---------------------------------------------------------


def request_password_reset(email):
    """Email a reset code if an active account has this address.

    Returns None whether or not the account exists, so the caller can answer the
    same way either way (no account enumeration). Cooldown and delivery problems
    are swallowed for the same reason; nothing about the address is logged.
    """
    email = normalize_email(email or "")
    user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
    if user is None:
        return
    try:
        send_reset_email(user, issue_otp(user, OTPPurpose.PASSWORD_RESET))
    except Exception:  # cooldown or delivery failure: stay silent to the caller
        logger.info("event=password_reset_not_sent user_id=%s", user.id)


def reset_password(email, code, new_password):
    """Verify the emailed code and set a new password. Returns (ok, message)."""
    email = normalize_email(email or "")
    generic = "That code is not valid. Request a new one and try again."
    user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
    if user is None or not isinstance(code, str) or not code or not isinstance(new_password, str):
        return False, generic
    now = timezone.now()
    with transaction.atomic():
        row = (
            EmailOTP.objects.select_for_update()
            .filter(user=user, purpose=OTPPurpose.PASSWORD_RESET)
            .order_by("-created_at")
            .first()
        )
        if row is None or row.is_consumed() or row.is_expired(now) or row.attempts >= EmailOTP.MAX_ATTEMPTS:
            return False, generic
        if not check_password(code, row.code_hash):
            row.attempts += 1
            row.save(update_fields=["attempts"])
            return False, generic
        try:
            validate_password(new_password, user)
        except ValidationError as exc:
            return False, " ".join(exc.messages)
        row.consumed_at = now
        row.save(update_fields=["consumed_at"])
        user.set_password(new_password)
        user.save(update_fields=["password"])
    return True, "Password updated."


# --- Invite ----------------------------------------------------------------


def create_staff_invite(*, owner, email, role):
    """Create an Owner-issued staff invite. Returns ``(invite, raw_token)``.

    Owner-only (single-sourced through ``can_manage_staff_invites``). The role
    is fixed here to Cashier/Trainer only; the invitee can never choose it.
    """
    if not can_manage_staff_invites(owner):
        raise PermissionDenied("Only an Owner may issue staff invites.")
    if role not in {Role.CASHIER, Role.TRAINER}:
        raise ValidationError("Staff invites may only assign Cashier or Trainer.")

    now = timezone.now()
    raw_token = secrets.token_urlsafe(32)
    invite = StaffInvite.objects.create(
        email=normalize_email(email),
        role=role,
        token_hash=make_password(raw_token),
        invited_by=owner,
        created_at=now,
        expires_at=now + StaffInvite.TTL,
    )
    return invite, raw_token


def accept_invite(*, raw_token, invite_id, password):
    """Accept a staff invite: set password, create+activate the staff account.

    The account email/username come from ``invite.email`` ONLY — never the
    request. The role comes from the invite. Single-use; constant-time token
    check.
    """
    now = timezone.now()
    invite = StaffInvite.objects.filter(pk=invite_id).first()
    if invite is None or not invite.is_usable(now):
        raise InvalidInviteError("This invite link is invalid or expired.")
    if not check_password(raw_token, invite.token_hash):
        raise InvalidInviteError("This invite link is invalid or expired.")

    username = invite.email  # already normalized at issue time
    if User.objects.filter(username=username).exists():
        # Invites provision NEW accounts only.
        raise InvalidInviteError("This invite link is invalid or expired.")

    with transaction.atomic():
        user = User(
            username=username,
            email=username,
            role=invite.role,
            is_active=True,
        )
        validate_password(password, user)
        user.set_password(password)
        user.save()
        invite.used_at = now
        invite.accepted_user = user
        invite.save(update_fields=["used_at", "accepted_user"])
    return user
