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
from django.db import IntegrityError, connection, transaction
from django.db.models import Q
from django.utils import timezone

from .emails import send_otp_email, send_reset_email
from .models import EmailOTP, OTPPurpose, Role, StaffInvite, User
from .permissions import can_manage_staff_invites

logger = logging.getLogger("apps.accounts.services")

# Longest email that can be stored as ``username`` (AbstractUser max_length).
MAX_EMAIL_LENGTH = 150


def role_home_url(user):
    """Server-side role home, matching web/auth.js homeForRole."""
    return {
        Role.OWNER: "/index",
        Role.CASHIER: "/cashier",
        Role.TRAINER: "/trainer/index",
        Role.MEMBER: "/member-home",
    }.get(getattr(user, "role", ""), "/index")


class EmailDeliveryError(Exception):
    """Raised when an email backend cannot deliver a message.

    Canonical home (imported lazily by ``email_backends.ResendEmailBackend``).
    """


class OTPCooldownError(Exception):
    """Raised when a resend is requested within the cooldown window."""

    def __init__(self, message: str = "Please wait before requesting another code.", *, retry_after: int = 60):
        super().__init__(message)
        self.retry_after = max(1, int(retry_after))


class OTPRateLimitError(Exception):
    """Raised when OTP resend requests exceed the rolling window limit."""

    def __init__(self, message: str = "Too many code requests. Please wait before trying again.", *, retry_after: int = 3600):
        super().__init__(message)
        self.retry_after = max(1, int(retry_after))


class InvalidInviteError(Exception):
    """Raised when a staff-invite token/link is invalid, expired, or used."""


class InviteEmailMismatchError(Exception):
    """Raised when Google email does not match the invited email."""


class InviteGoogleInUseError(Exception):
    """Raised when the Google account is already linked to another user."""


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


_otp_schema_ready = False


def ensure_otp_schema() -> None:
    """Idempotently ensure accounts_emailotp exists on PostgreSQL deployments."""
    global _otp_schema_ready
    if _otp_schema_ready:
        return
    engine = connection.settings_dict.get("ENGINE", "")
    if "postgresql" not in engine:
        _otp_schema_ready = True
        return
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts_emailotp';"
            )
            exists = cursor.fetchone()
        if not exists:
            from django.core.management import call_command

            call_command("migrate", "accounts", interactive=False)
        _otp_schema_ready = True
    except Exception:
        logger.warning("event=otp_schema_check_deferred")


def _issue_and_send_otp(user, purpose, send_fn) -> str:
    """Issue a new OTP and roll it back (restoring prior unexpired OTP) if delivery fails."""
    ensure_otp_schema()
    now = timezone.now()
    prior_ids = list(
        EmailOTP.objects.filter(
            user=user,
            purpose=purpose,
            consumed_at__isnull=True,
            expires_at__gt=now,
        ).values_list("id", flat=True)
    )
    code = issue_otp(user, purpose)
    created_row = (
        EmailOTP.objects.filter(user=user, purpose=purpose)
        .exclude(id__in=prior_ids)
        .order_by("-created_at")
        .first()
    )
    try:
        send_fn(user, code)
    except EmailDeliveryError:
        with transaction.atomic():
            if created_row is not None:
                EmailOTP.objects.filter(id=created_row.id).delete()
            if prior_ids:
                EmailOTP.objects.filter(id__in=prior_ids).update(consumed_at=None)
        raise
    return code


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
            try:
                _issue_and_send_otp(user, OTPPurpose.SIGNUP, send_otp_email)
            except EmailDeliveryError:
                # The inactive user row persists; let the member resend immediately from
                # the verify page without cooldown lockout. Never a 500.
                return RegisterResult(pending_user_id=user.id, delivery_failed=True)
            return RegisterResult(pending_user_id=user.id)

    if not existing.is_active:
        # Legitimate re-signup: re-issue to the same user (cooldown/rate limit
        # suppresses duplicate mail, preserving the generic response).
        try:
            _issue_and_send_otp(existing, OTPPurpose.SIGNUP, send_otp_email)
        except (OTPCooldownError, OTPRateLimitError):
            return RegisterResult(pending_user_id=existing.id)
        except EmailDeliveryError:
            return RegisterResult(pending_user_id=existing.id, delivery_failed=True)
        return RegisterResult(pending_user_id=existing.id)

    # Already active: decoy. No user created, no mail sent.
    return RegisterResult(pending_user_id=None, decoy=True)


def issue_otp(user, purpose) -> str:
    """PERSIST ONLY: enforce cooldown + rate limit, invalidate prior OTPs, store, return raw code.

    Never sends mail; never logs the code.
    """
    now = timezone.now()
    latest = (
        EmailOTP.objects.filter(user=user, purpose=purpose)
        .order_by("-created_at")
        .first()
    )
    if latest is not None:
        elapsed = now - latest.created_at
        if elapsed < EmailOTP.RESEND_COOLDOWN:
            remaining = (EmailOTP.RESEND_COOLDOWN - elapsed).total_seconds()
            raise OTPCooldownError(
                "Please wait before requesting another code.",
                retry_after=max(1, int(remaining + 0.999)),
            )

    recent_count = EmailOTP.objects.filter(
        user=user,
        purpose=purpose,
        created_at__gte=now - EmailOTP.RESEND_WINDOW,
    ).count()
    if recent_count >= EmailOTP.MAX_RESENDS_PER_WINDOW:
        oldest_in_window = (
            EmailOTP.objects.filter(
                user=user,
                purpose=purpose,
                created_at__gte=now - EmailOTP.RESEND_WINDOW,
            )
            .order_by("created_at")
            .values_list("created_at", flat=True)
            .first()
        )
        retry_after = 60
        if oldest_in_window is not None:
            retry_after = max(1, int(((oldest_in_window + EmailOTP.RESEND_WINDOW) - now).total_seconds() + 0.999))
        raise OTPRateLimitError(
            "Too many verification code requests. Please wait before trying again.",
            retry_after=retry_after,
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    with transaction.atomic():
        EmailOTP.objects.filter(
            user=user,
            purpose=purpose,
            consumed_at__isnull=True,
        ).update(consumed_at=now)
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
    code = code.strip() if isinstance(code, str) else ""
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

    Raises ``OTPCooldownError`` when still cooling down, ``OTPRateLimitError``
    when the hourly resend cap is reached, and ``EmailDeliveryError`` when
    the backend cannot deliver (rolling back the undelivered OTP).
    """
    _issue_and_send_otp(user, OTPPurpose.SIGNUP, send_otp_email)


def issue_first_login_otp(user, *, force_resend: bool = False):
    """Issue and email a FIRST_LOGIN OTP unless an active one already exists (unless forced)."""
    ensure_otp_schema()
    now = timezone.now()
    if not force_resend:
        existing_usable = (
            EmailOTP.objects.filter(
                user=user,
                purpose=OTPPurpose.FIRST_LOGIN,
                consumed_at__isnull=True,
                expires_at__gt=now,
                attempts__lt=EmailOTP.MAX_ATTEMPTS,
            )
            .order_by("-created_at")
            .first()
        )
        if existing_usable is not None:
            return None
    return _issue_and_send_otp(user, OTPPurpose.FIRST_LOGIN, send_otp_email)


def verify_first_login_otp(user, code) -> VerifyResult:
    """Verify ``code`` against the latest FIRST_LOGIN OTP for an authenticated user."""
    code = code.strip() if isinstance(code, str) else ""
    now = timezone.now()
    with transaction.atomic():
        row = (
            EmailOTP.objects.select_for_update()
            .filter(user=user, purpose=OTPPurpose.FIRST_LOGIN)
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
            user.needs_first_login_otp = False
            user.first_login_otp_verified_at = now
            user.save(update_fields=["needs_first_login_otp", "first_login_otp_verified_at"])
            return VerifyResult(ok=True, reason="ok")

        row.attempts += 1
        row.save(update_fields=["attempts"])
        if row.attempts >= EmailOTP.MAX_ATTEMPTS:
            logger.info("event=first_login_otp_attempts_exceeded user_id=%s", user.id)
            return VerifyResult(ok=False, reason="capped")
        return VerifyResult(ok=False, reason="bad_code")


def resend_first_login_otp(user):
    """Force-resend a FIRST_LOGIN OTP, enforcing cooldown and rolling window caps."""
    return issue_first_login_otp(user, force_resend=True)


def record_legal_consent(user) -> None:
    """Record explicit ToS + Privacy Policy acceptance and clear the consent gate."""
    now = timezone.now()
    user.tos_accepted_at = now
    user.privacy_accepted_at = now
    user.needs_legal_consent = False
    user.save(update_fields=["tos_accepted_at", "privacy_accepted_at", "needs_legal_consent"])


def _find_active_user_by_email(email: str):
    norm = normalize_email(email or "")
    if not norm:
        return None
    return User.objects.filter(
        Q(email__iexact=norm) | Q(username__iexact=norm),
        is_active=True,
    ).first()


def resend_password_reset_otp(email: str) -> None:
    """Re-issue and send a PASSWORD_RESET OTP for an active account.

    No-ops quietly when the email has no active account (anti-enumeration),
    while letting cooldown, rate-limit, and delivery errors propagate for real
    accounts so the verification screen can surface countdown/error state.
    """
    norm = normalize_email(email or "")
    if not norm:
        raise ValidationError("Enter a valid email address.")
    validate_email(norm)
    user = _find_active_user_by_email(norm)
    if user is None:
        return
    if not (user.email or "").strip():
        user.email = norm
        user.save(update_fields=["email"])
    _issue_and_send_otp(user, OTPPurpose.PASSWORD_RESET, send_reset_email)


# --- Password reset ---------------------------------------------------------


def request_password_reset(email) -> int:
    """Email a reset code if an active account has this address.

    Returns the cooldown seconds for the client countdown. Anti-enumeration is
    preserved for unknown emails (returns 60, sends no email). Cooldown hits
    keep the existing valid code active and return remaining seconds; rate
    limits and delivery failures propagate so callers can show real errors
    instead of advancing to code entry with an undelivered OTP.
    """
    norm = normalize_email(email or "")
    user = _find_active_user_by_email(norm) if norm else None
    if user is None:
        return 60
    if not (user.email or "").strip():
        user.email = norm
        user.save(update_fields=["email"])
    try:
        _issue_and_send_otp(user, OTPPurpose.PASSWORD_RESET, send_reset_email)
        return 60
    except OTPCooldownError as exc:
        logger.info("event=password_reset_cooldown user_id=%s", user.id)
        return exc.retry_after


def verify_password_reset_otp(email, code):
    """Verify a password-reset OTP before showing the new-password step.

    Returns ``(ok, message)``. Does NOT consume the OTP on success so the next
    step (``reset_password``) can verify and atomically consume it while saving
    the new password. Increments ``attempts`` on wrong codes.
    """
    norm = normalize_email(email or "")
    code = code.strip() if isinstance(code, str) else ""
    generic = "That code is not valid or has expired. Request a new one and try again."
    user = _find_active_user_by_email(norm) if norm else None
    if user is None or not code:
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
            if row.attempts >= EmailOTP.MAX_ATTEMPTS:
                logger.info("event=otp_attempts_exceeded user_id=%s", user.id)
            return False, generic
    return True, "Code verified. You can now set a new password."


def reset_password(email, code, new_password):
    """Verify the emailed code and set a new password. Returns (ok, message)."""
    norm = normalize_email(email or "")
    code = code.strip() if isinstance(code, str) else ""
    generic = "That code is not valid. Request a new one and try again."
    user = _find_active_user_by_email(norm) if norm else None
    if user is None or not code or not isinstance(new_password, str):
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


def get_valid_staff_invite(*, raw_token, invite_id, lock: bool = False) -> StaffInvite:
    """Validate an invite id + raw token (checking expiry, use, and revocation)."""
    if not raw_token or not isinstance(raw_token, str):
        raise InvalidInviteError("This invite link is invalid or expired.")
    now = timezone.now()
    qs = StaffInvite.objects.filter(pk=invite_id)
    if lock:
        qs = qs.select_for_update()
    invite = qs.first()
    if invite is None or not invite.is_usable(now):
        raise InvalidInviteError("This invite link is invalid or expired.")
    if not check_password(raw_token, invite.token_hash):
        raise InvalidInviteError("This invite link is invalid or expired.")
    return invite


def accept_invite(*, raw_token, invite_id, password):
    """Accept a staff invite: set password, create+activate the staff account.

    The account email/username come from ``invite.email`` ONLY — never the
    request. The role comes from the invite. Single-use; constant-time token
    check.
    """
    now = timezone.now()
    with transaction.atomic():
        invite = get_valid_staff_invite(raw_token=raw_token, invite_id=invite_id, lock=True)
        username = invite.email  # already normalized at issue time
        existing = User.objects.select_for_update().filter(username=username).first()
        if existing is not None and (existing.is_active or existing.has_usable_password() or existing.role != invite.role):
            # Invites provision NEW accounts (or activate a pending pre-created staff invite account).
            raise InvalidInviteError("This invite link is invalid or expired.")

        if existing is not None:
            user = existing
            user.email = username
            user.is_active = True
        else:
            user = User(
                username=username,
                email=username,
                role=invite.role,
                is_active=True,
            )
        validate_password(password, user)
        user.set_password(password)
        user.must_change_password = False
        user.save()
        invite.used_at = now
        invite.accepted_user = user
        invite.save(update_fields=["used_at", "accepted_user"])
    return user


def accept_invite_with_google(*, raw_token, invite_id, claims):
    """Accept a staff invite using Google Sign-In; invited email must match Google claims.email."""
    now = timezone.now()
    with transaction.atomic():
        invite = get_valid_staff_invite(raw_token=raw_token, invite_id=invite_id, lock=True)
        invited_email = normalize_email(invite.email)
        claims_email = normalize_email(getattr(claims, "email", "") or "")
        if not claims_email or claims_email != invited_email:
            raise InviteEmailMismatchError(
                "Your Google email must match the invited email address."
            )

        username = invited_email
        if User.objects.filter(google_sub=claims.sub).exclude(username=username).exists():
            raise InviteGoogleInUseError(
                "This Google account is already connected to another ProFit account."
            )

        existing = User.objects.select_for_update().filter(username=username).first()
        if existing is not None and (existing.is_active or existing.has_usable_password() or existing.role != invite.role):
            raise InvalidInviteError("This invite link is invalid or expired.")

        if existing is not None:
            user = existing
            user.email = username
            user.is_active = True
        else:
            user = User(
                username=username,
                email=username,
                role=invite.role,
                is_active=True,
            )
            user.set_unusable_password()
            raw_name = (getattr(claims, "name", "") or "").strip()
            if raw_name:
                parts = raw_name.split(None, 1)
                user.first_name = parts[0][:150]
                user.last_name = (parts[1] if len(parts) > 1 else "")[:150]

        user.google_sub = claims.sub
        user.google_email = claims_email
        user.google_linked_at = now
        user.must_change_password = False
        if user.first_login_otp_verified_at is None:
            user.needs_first_login_otp = True
        if user.tos_accepted_at is None or user.privacy_accepted_at is None:
            user.needs_legal_consent = True
        user.save()

        invite.used_at = now
        invite.accepted_user = user
        invite.save(update_fields=["used_at", "accepted_user"])
    return user
