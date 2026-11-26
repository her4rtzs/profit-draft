"""Google Sign-In (OIDC ID token + OAuth 2.0 code) and verified account linking.

Security & domain invariants:
  - Google Sign-In is restricted strictly to Member accounts (Role.MEMBER).
    Staff/Admin/Trainer accounts (OWNER, CASHIER, TRAINER, is_staff, is_superuser)
    are ALWAYS rejected with 403.
  - ID tokens are cryptographically verified against Google's RS256 JWKS keys
    using Python's standard library (zero extra dependencies), checking signature,
    issuer (accounts.google.com / https://accounts.google.com), audience, and
    expiration.
  - Existing accounts matched by email NEVER auto-link on email alone; the
    caller must enter the existing ProFit password to verify ownership before
    linking ``google_sub``.
  - One ``google_sub`` can link to at most one ProFit user account.
  - LOGGING POLICY: never log PII (emails, names), tokens, or client secrets.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import IntegrityError, connection, transaction
from django.db.models import Q
from django.utils import timezone

from apps.membership.models import MemberProfile
from apps.membership.services import _split_name, start_trial

from .models import Role, User
from .services import MAX_EMAIL_LENGTH, normalize_email
from .validators import validate_real_email

logger = logging.getLogger("apps.accounts.google_auth")

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})
GOOGLE_SCOPES = "openid email profile"
JWKS_CACHE_TTL_SECONDS = 3600
LINK_TOKEN_MAX_AGE_SECONDS = 600
CLOCK_SKEW_SECONDS = 30
LINK_SIGNER_SALT = "profit.google.link"

# ASN.1 DER DigestInfo prefix for SHA-256 (RFC 8017 Section 9.2)
_SHA256_DIGEST_INFO_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")

_jwks_lock = threading.Lock()
_jwks_cache: dict[str, object] = {"expires_at": 0.0, "keys": {}}
_schema_checked = False


def ensure_google_user_columns() -> None:
    """Idempotently add google_sub and google_linked_at columns on PostgreSQL.

    Vercel serverless builds run collectstatic without database migrations
    (see 2026-11-14 Serverless deploy decision note), so this guards against
    UndefinedColumn errors on the first auth request after deploy.
    """
    global _schema_checked
    if _schema_checked:
        return
    engine = connection.settings_dict.get("ENGINE", "")
    if "postgresql" not in engine:
        _schema_checked = True
        return
    try:
        with connection.cursor() as cursor:
            cols = {
                c.name
                for c in connection.introspection.get_table_description(cursor, "accounts_user")
            }
            if "google_sub" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS google_sub varchar(255) NULL;"
                )
                cursor.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_google_sub_uniq "
                    "ON accounts_user (google_sub) WHERE google_sub IS NOT NULL;"
                )
            if "google_linked_at" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS google_linked_at timestamp with time zone NULL;"
                )
            if "must_change_password" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;"
                )
            if "avatar_data" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS avatar_data text NOT NULL DEFAULT '';"
                )
            if "onboarding_data" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS onboarding_data jsonb NOT NULL DEFAULT '{}'::jsonb;"
                )
            if "google_email" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS google_email varchar(254) NOT NULL DEFAULT '';"
                )
            if "needs_first_login_otp" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS needs_first_login_otp boolean NOT NULL DEFAULT false;"
                )
            if "first_login_otp_verified_at" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS first_login_otp_verified_at timestamp with time zone NULL;"
                )
            if "needs_legal_consent" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS needs_legal_consent boolean NOT NULL DEFAULT false;"
                )
            if "tos_accepted_at" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS tos_accepted_at timestamp with time zone NULL;"
                )
            if "privacy_accepted_at" not in cols:
                cursor.execute(
                    "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamp with time zone NULL;"
                )
            tables = set(connection.introspection.table_names(cursor))
            if "accounts_staffinvite" in tables:
                invite_cols = {
                    c.name
                    for c in connection.introspection.get_table_description(cursor, "accounts_staffinvite")
                }
                if "revoked_at" not in invite_cols:
                    cursor.execute(
                        "ALTER TABLE accounts_staffinvite ADD COLUMN IF NOT EXISTS revoked_at timestamp with time zone NULL;"
                    )
            if "membership_memberprofile" in tables:
                member_cols = {
                    c.name
                    for c in connection.introspection.get_table_description(cursor, "membership_memberprofile")
                }
                if "trial_ends_at" not in member_cols:
                    cursor.execute(
                        "ALTER TABLE membership_memberprofile ADD COLUMN IF NOT EXISTS trial_ends_at timestamp with time zone NULL;"
                    )
                if "onboarding_data" not in member_cols:
                    cursor.execute(
                        "ALTER TABLE membership_memberprofile ADD COLUMN IF NOT EXISTS onboarding_data jsonb NOT NULL DEFAULT '{}'::jsonb;"
                    )
        _schema_checked = True
    except Exception as exc:
        pgcode = getattr(getattr(exc, "__cause__", None), "pgcode", "") or ""
        logger.warning("event=google_schema_check_deferred err=%s pgcode=%s", type(exc).__name__, pgcode)


class GoogleAuthError(Exception):
    """Domain error with HTTP status code and machine-readable reason."""

    def __init__(self, message: str, *, status_code: int = 400, code: str = "google_auth_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


@dataclass(frozen=True)
class GoogleClaims:
    """Verified identity claims extracted from a Google ID token."""

    sub: str
    email: str
    email_verified: bool
    name: str
    picture: str = ""


@dataclass(frozen=True)
class GoogleAuthOutcome:
    """Result of authenticating/registering a Member from Google claims."""

    status: str  # "authenticated" | "link_required"
    user: User | None = None
    created: bool = False
    email: str = ""
    link_token: str = ""


def _b64url_decode(segment: str) -> bytes:
    if not isinstance(segment, str) or not segment:
        raise ValueError("Empty base64url segment.")
    padded = segment + "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _fetch_google_jwks() -> dict:
    req = urllib.request.Request(
        GOOGLE_JWKS_URL,
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.warning("event=google_jwks_fetch_failed")
        raise GoogleAuthError(
            "Could not reach Google to verify sign-in. Please check your connection and try again.",
            status_code=503,
            code="network_error",
        ) from exc
    if not isinstance(data, dict) or not isinstance(data.get("keys"), list):
        raise GoogleAuthError(
            "Unable to verify Google credentials right now. Please try again.",
            status_code=503,
            code="jwks_invalid",
        )
    return data


def _index_jwks(jwks_payload: dict) -> dict[str, dict]:
    keys: dict[str, dict] = {}
    for entry in jwks_payload.get("keys") or []:
        if (
            isinstance(entry, dict)
            and entry.get("kty") == "RSA"
            and entry.get("kid")
            and entry.get("n")
            and entry.get("e")
        ):
            keys[str(entry["kid"])] = entry
    return keys


def _get_jwk(kid: str, *, jwks_fetcher=None) -> dict | None:
    if jwks_fetcher is not None:
        return _index_jwks(jwks_fetcher()).get(kid)

    now = time.monotonic()
    with _jwks_lock:
        if now < float(_jwks_cache["expires_at"]):
            cached = _jwks_cache["keys"].get(kid)  # type: ignore[union-attr]
            if cached is not None:
                return cached

    # Refresh (cache miss, expired, or key rotation)
    payload = _fetch_google_jwks()
    indexed = _index_jwks(payload)
    with _jwks_lock:
        _jwks_cache["keys"] = indexed
        _jwks_cache["expires_at"] = time.monotonic() + JWKS_CACHE_TTL_SECONDS
    return indexed.get(kid)


def _verify_rs256_signature(signing_input: bytes, signature: bytes, jwk: dict) -> bool:
    try:
        n_bytes = _b64url_decode(jwk["n"])
        e_bytes = _b64url_decode(jwk["e"])
    except (KeyError, ValueError, binascii.Error):
        return False

    n_int = int.from_bytes(n_bytes, "big")
    e_int = int.from_bytes(e_bytes, "big")
    if n_int <= 0 or e_int <= 0:
        return False

    k = (n_int.bit_length() + 7) // 8
    if len(signature) != k:
        return False

    sig_int = int.from_bytes(signature, "big")
    if sig_int >= n_int:
        return False

    m_int = pow(sig_int, e_int, n_int)
    em = m_int.to_bytes(k, "big")
    digest_info = _SHA256_DIGEST_INFO_PREFIX + hashlib.sha256(signing_input).digest()
    ps_len = k - len(digest_info) - 3
    if ps_len < 8:
        return False
    expected_em = b"\x00\x01" + (b"\xff" * ps_len) + b"\x00" + digest_info
    return hmac.compare_digest(em, expected_em)


def _validate_google_email(raw_email, email_verified) -> str:
    if email_verified is not True:
        raise GoogleAuthError(
            "Your Google account email is not verified. Verify your email in Google first.",
            status_code=400,
            code="email_not_verified",
        )
    if not isinstance(raw_email, str):
        raise GoogleAuthError("Google account did not provide an email address.", status_code=400, code="invalid_claims")
    try:
        norm_email = validate_real_email(raw_email)
    except ValidationError as exc:
        raise GoogleAuthError(exc.messages[0], status_code=400, code="invalid_claims") from exc
    if len(norm_email) > MAX_EMAIL_LENGTH:
        raise GoogleAuthError("Email address is too long for this portal.", status_code=400, code="invalid_claims")
    return norm_email


def verify_google_id_token(
    token: str,
    *,
    client_id: str | None = None,
    jwks_fetcher=None,
    now_ts: float | None = None,
) -> GoogleClaims:
    """Cryptographically verify a Google OIDC ID token and return validated claims."""
    expected_client_id = (client_id if client_id is not None else getattr(settings, "GOOGLE_CLIENT_ID", "")).strip()
    if not expected_client_id:
        raise GoogleAuthError(
            "Google Sign-In is not configured on this server.",
            status_code=503,
            code="not_configured",
        )
    if not isinstance(token, str) or token.count(".") != 2:
        raise GoogleAuthError("Invalid Google credential.", status_code=401, code="invalid_token")

    header_b64, payload_b64, sig_b64 = token.split(".")
    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
        claims = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        signature = _b64url_decode(sig_b64)
    except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
        raise GoogleAuthError("Invalid Google credential.", status_code=401, code="invalid_token") from exc

    if not isinstance(header, dict) or not isinstance(claims, dict):
        raise GoogleAuthError("Invalid Google credential.", status_code=401, code="invalid_token")
    if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str) or not header["kid"]:
        raise GoogleAuthError("Unsupported Google credential signature.", status_code=401, code="invalid_token")

    jwk = _get_jwk(header["kid"], jwks_fetcher=jwks_fetcher)
    if jwk is None:
        raise GoogleAuthError("Google signing key was not recognized. Please try again.", status_code=401, code="invalid_token")

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    if not _verify_rs256_signature(signing_input, signature, jwk):
        raise GoogleAuthError("Google credential signature could not be verified.", status_code=401, code="invalid_token")

    now = float(now_ts if now_ts is not None else time.time())
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleAuthError("Invalid Google credential issuer.", status_code=401, code="invalid_token")

    aud = claims.get("aud")
    if isinstance(aud, list):
        aud_ok = expected_client_id in aud
    else:
        aud_ok = aud == expected_client_id
    if not aud_ok:
        raise GoogleAuthError("Google credential audience mismatch.", status_code=401, code="invalid_token")

    azp = claims.get("azp")
    if azp is not None and azp != expected_client_id:
        raise GoogleAuthError("Google credential client mismatch.", status_code=401, code="invalid_token")

    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or isinstance(exp, bool) or now >= float(exp):
        raise GoogleAuthError("Your Google sign-in session expired. Please try again.", status_code=401, code="token_expired")

    nbf = claims.get("nbf")
    if nbf is not None:
        if not isinstance(nbf, (int, float)) or isinstance(nbf, bool) or float(nbf) > now + CLOCK_SKEW_SECONDS:
            raise GoogleAuthError("Google credential is not valid yet.", status_code=401, code="invalid_token")

    iat = claims.get("iat")
    if iat is not None:
        if not isinstance(iat, (int, float)) or isinstance(iat, bool) or float(iat) > now + CLOCK_SKEW_SECONDS:
            raise GoogleAuthError("Invalid Google credential timestamp.", status_code=401, code="invalid_token")

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub.strip() or len(sub) > 255:
        raise GoogleAuthError("Google account identifier missing.", status_code=400, code="invalid_claims")

    norm_email = _validate_google_email(claims.get("email"), claims.get("email_verified"))

    return GoogleClaims(
        sub=sub.strip(),
        email=norm_email,
        email_verified=True,
        name=str(claims.get("name") or "").strip()[:150],
        picture=str(claims.get("picture") or "").strip(),
    )


def _google_get_json(url: str, *, headers: dict[str, str] | None = None, http_get=None) -> dict:
    if http_get is not None:
        data = http_get(url, headers or {})
    else:
        req = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            logger.warning("event=google_oauth_http_error status=%s", exc.code)
            if exc.code in (400, 401, 403):
                raise GoogleAuthError("Google credential could not be verified. Please try again.", status_code=401, code="invalid_token") from exc
            raise GoogleAuthError("Could not reach Google to verify sign-in. Please try again.", status_code=503, code="network_error") from exc
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            logger.warning("event=google_oauth_network_error")
            raise GoogleAuthError("Could not reach Google to verify sign-in. Please check your connection and try again.", status_code=503, code="network_error") from exc
    if not isinstance(data, dict):
        raise GoogleAuthError("Unable to verify Google credentials right now. Please try again.", status_code=503, code="invalid_response")
    return data


def verify_google_access_token(
    access_token: str,
    *,
    client_id: str | None = None,
    http_get=None,
) -> GoogleClaims:
    """Verify a Google OAuth 2.0 access token via tokeninfo and fetch userinfo claims."""
    expected_client_id = (client_id if client_id is not None else getattr(settings, "GOOGLE_CLIENT_ID", "")).strip()
    if not expected_client_id:
        raise GoogleAuthError("Google Sign-In is not configured on this server.", status_code=503, code="not_configured")
    if not isinstance(access_token, str) or not access_token.strip():
        raise GoogleAuthError("Invalid Google access token.", status_code=401, code="invalid_token")

    token = access_token.strip()
    tokeninfo_url = f"{GOOGLE_TOKENINFO_URL}?{urllib.parse.urlencode({'access_token': token})}"
    token_info = _google_get_json(tokeninfo_url, http_get=http_get)

    aud = token_info.get("aud")
    azp = token_info.get("azp")
    aud_matches = (expected_client_id in aud) if isinstance(aud, list) else (aud == expected_client_id)
    if not aud_matches and azp != expected_client_id:
        raise GoogleAuthError("Google credential audience mismatch.", status_code=401, code="invalid_token")

    try:
        expires_in = int(token_info.get("expires_in", 0))
    except (TypeError, ValueError) as exc:
        raise GoogleAuthError("Invalid Google credential expiration.", status_code=401, code="invalid_token") from exc
    if expires_in <= 0:
        raise GoogleAuthError("Your Google sign-in session expired. Please try again.", status_code=401, code="token_expired")

    userinfo = _google_get_json(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {token}"}, http_get=http_get)
    sub = userinfo.get("sub")
    if not isinstance(sub, str) or not sub.strip() or len(sub) > 255:
        raise GoogleAuthError("Google account identifier missing.", status_code=400, code="invalid_claims")

    norm_email = _validate_google_email(userinfo.get("email"), userinfo.get("email_verified"))

    return GoogleClaims(
        sub=sub.strip(),
        email=norm_email,
        email_verified=True,
        name=str(userinfo.get("name") or "").strip()[:150],
        picture=str(userinfo.get("picture") or "").strip(),
    )


def exchange_google_code(
    code: str,
    *,
    redirect_uri: str,
    token_fetcher=None,
    jwks_fetcher=None,
) -> GoogleClaims:
    """Exchange an OAuth 2.0 authorization code for a verified Google ID token."""
    client_id = (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip()
    client_secret = (getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "").strip()
    if not client_id or not client_secret:
        raise GoogleAuthError(
            "Google OAuth redirect sign-in is not configured on this server.",
            status_code=503,
            code="not_configured",
        )
    if not isinstance(code, str) or not code.strip():
        raise GoogleAuthError("Missing authorization code from Google.", status_code=400, code="invalid_code")

    form = urllib.parse.urlencode({
        "code": code.strip(),
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("utf-8")

    if token_fetcher is not None:
        token_data = token_fetcher(form)
    else:
        req = urllib.request.Request(
            GOOGLE_TOKEN_URL,
            data=form,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                token_data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            logger.warning("event=google_token_exchange_http_error status=%s", exc.code)
            raise GoogleAuthError("Google authorization could not be completed. Please try again.", status_code=401, code="exchange_failed") from exc
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            logger.warning("event=google_token_exchange_failed")
            raise GoogleAuthError("Network error while contacting Google. Please try again.", status_code=503, code="network_error") from exc

    id_token = token_data.get("id_token") if isinstance(token_data, dict) else None
    if not id_token:
        raise GoogleAuthError("Google did not return an identity token.", status_code=401, code="missing_id_token")

    return verify_google_id_token(id_token, client_id=client_id, jwks_fetcher=jwks_fetcher)


def _assert_member_eligible(user: User) -> None:
    if user.role != Role.MEMBER or user.is_staff or user.is_superuser:
        raise GoogleAuthError(
            "This staff account is not connected to Google yet. Sign in with your email and password first, then connect Google in Settings.",
            status_code=403,
            code="not_linked",
        )
    if not user.is_active:
        raise GoogleAuthError(
            "This member account is not active yet. Please contact the gym or verify your email first.",
            status_code=403,
            code="account_disabled",
        )


def _apply_first_login_gate_flags(user: User) -> None:
    """Require first-login OTP and/or Terms+Privacy consent if not yet recorded."""
    update_fields = []
    if user.first_login_otp_verified_at is None and not user.needs_first_login_otp:
        user.needs_first_login_otp = True
        update_fields.append("needs_first_login_otp")
    if (user.tos_accepted_at is None or user.privacy_accepted_at is None) and not user.needs_legal_consent:
        user.needs_legal_consent = True
        update_fields.append("needs_legal_consent")
    if update_fields:
        user.save(update_fields=update_fields)


def _issue_link_token(user: User, sub: str) -> str:
    signer = TimestampSigner(salt=LINK_SIGNER_SALT)
    return signer.sign_object({"uid": user.pk, "sub": sub, "email": normalize_email(user.email or "")})


def _ensure_google_member_trial(user: User) -> MemberProfile:
    """Create a MemberProfile if missing and start the 7-day trial for never-enrolled accounts."""
    profile, created = MemberProfile.objects.get_or_create(
        user=user,
        defaults={"membership_status": MemberProfile.MembershipStatus.PENDING},
    )
    if (
        created
        or (
            profile.membership_status == MemberProfile.MembershipStatus.PENDING
            and profile.trial_ends_at is None
            and profile.expiry_date is None
        )
    ):
        start_trial(profile)
    return profile


def authenticate_google_login(claims: GoogleClaims) -> GoogleAuthOutcome:
    """Authenticate any active ProFit account (Owner, Cashier, Trainer, Member) ONLY if Google is linked."""
    linked_user = User.objects.filter(google_sub=claims.sub).first()
    if linked_user is None:
        raise GoogleAuthError(
            "This Google account is not connected to a ProFit account. Sign in with your email and password first, then connect Google in Settings.",
            status_code=403,
            code="not_linked",
        )
    if not linked_user.is_active:
        raise GoogleAuthError(
            "This account is not active. Please contact the gym administrator.",
            status_code=403,
            code="account_disabled",
        )
    if linked_user.google_email != claims.email:
        linked_user.google_email = claims.email
        linked_user.save(update_fields=["google_email"])
    if linked_user.role == Role.MEMBER:
        _ensure_google_member_trial(linked_user)
    _apply_first_login_gate_flags(linked_user)
    return GoogleAuthOutcome(status="authenticated", user=linked_user, created=False)


def authenticate_google_member(claims: GoogleClaims) -> GoogleAuthOutcome:
    """Authenticate an existing Google-linked user or register a new Member via /join."""
    linked_user = User.objects.filter(google_sub=claims.sub).first()
    if linked_user is not None:
        return authenticate_google_login(claims)

    existing = User.objects.filter(Q(email__iexact=claims.email) | Q(username__iexact=claims.email)).first()
    if existing is not None:
        _assert_member_eligible(existing)
        if existing.google_sub and existing.google_sub != claims.sub:
            raise GoogleAuthError(
                "This ProFit account is already linked to a different Google account.",
                status_code=409,
                code="already_linked_other",
            )
        return GoogleAuthOutcome(
            status="link_required",
            user=None,
            created=False,
            email=existing.email or claims.email,
            link_token=_issue_link_token(existing, claims.sub),
        )

    display_name = claims.name or claims.email.split("@", 1)[0]
    first, last = _split_name(display_name)
    first = first[:150]
    last = last[:150]

    try:
        with transaction.atomic():
            user = User(
                username=claims.email,
                email=claims.email,
                first_name=first,
                last_name=last,
                role=Role.MEMBER,
                is_active=True,
                google_sub=claims.sub,
                google_email=claims.email,
                google_linked_at=timezone.now(),
                needs_first_login_otp=True,
                needs_legal_consent=True,
            )
            user.set_unusable_password()
            user.save()
            _ensure_google_member_trial(user)
            return GoogleAuthOutcome(status="authenticated", user=user, created=True)
    except IntegrityError:
        # Race condition: inspect whether google_sub or email was created concurrently
        raced_sub = User.objects.filter(google_sub=claims.sub).first()
        if raced_sub is not None:
            return authenticate_google_login(claims)
        raced_email = User.objects.filter(Q(email__iexact=claims.email) | Q(username__iexact=claims.email)).first()
        if raced_email is not None:
            _assert_member_eligible(raced_email)
            if raced_email.google_sub and raced_email.google_sub != claims.sub:
                raise GoogleAuthError(
                    "This ProFit account is already linked to a different Google account.",
                    status_code=409,
                    code="already_linked_other",
                )
            return GoogleAuthOutcome(
                status="link_required",
                user=None,
                created=False,
                email=raced_email.email or claims.email,
                link_token=_issue_link_token(raced_email, claims.sub),
            )
        raise GoogleAuthError("Could not complete Google registration right now. Please try again.", status_code=500, code="db_error")


def verify_and_link_google_account(link_token: str, password: str) -> User:
    """Verify the existing Member's password before linking a Google account."""
    if not isinstance(link_token, str) or not link_token.strip():
        raise GoogleAuthError("Account linking session is missing. Please sign in with Google again.", status_code=400, code="invalid_link_token")
    if not isinstance(password, str) or not password:
        raise GoogleAuthError("Enter your ProFit password to verify and link your account.", status_code=400, code="password_required")

    signer = TimestampSigner(salt=LINK_SIGNER_SALT)
    try:
        data = signer.unsign_object(link_token.strip(), max_age=LINK_TOKEN_MAX_AGE_SECONDS)
    except SignatureExpired as exc:
        raise GoogleAuthError("Your verification prompt expired. Please click Google Sign-In again.", status_code=400, code="link_expired") from exc
    except BadSignature as exc:
        raise GoogleAuthError("Invalid linking token. Please click Google Sign-In again.", status_code=400, code="invalid_link_token") from exc

    if not isinstance(data, dict) or not data.get("uid") or not data.get("sub"):
        raise GoogleAuthError("Invalid linking token.", status_code=400, code="invalid_link_token")

    uid = data["uid"]
    sub = str(data["sub"])

    with transaction.atomic():
        user = User.objects.select_for_update().filter(pk=uid).first()
        if user is None:
            raise GoogleAuthError("Account could not be found.", status_code=404, code="account_not_found")
        _assert_member_eligible(user)
        if not user.has_usable_password() or not user.check_password(password):
            raise GoogleAuthError("Incorrect ProFit password. Your account was not linked.", status_code=400, code="wrong_password")
        if user.google_sub and user.google_sub != sub:
            raise GoogleAuthError("This ProFit account is already linked to a different Google account.", status_code=409, code="already_linked_other")
        if User.objects.filter(google_sub=sub).exclude(pk=user.pk).exists():
            raise GoogleAuthError("This Google account is already linked to another ProFit user.", status_code=409, code="google_sub_in_use")
        if not user.google_sub:
            user.google_sub = sub
            user.google_linked_at = timezone.now()
            user.save(update_fields=["google_sub", "google_linked_at"])
        MemberProfile.objects.get_or_create(user=user)
        _apply_first_login_gate_flags(user)
        return user


def connect_google_account(user: User, claims: GoogleClaims) -> User:
    """Link a Google account to an already authenticated, active user (any role)."""
    if not user or not user.is_authenticated or not user.is_active:
        raise GoogleAuthError("Sign in to an active account first.", status_code=401, code="not_authenticated")

    with transaction.atomic():
        locked = User.objects.select_for_update().filter(pk=user.pk).first()
        if locked is None or not locked.is_active:
            raise GoogleAuthError("Account is not active.", status_code=403, code="account_disabled")
        if locked.google_sub and locked.google_sub != claims.sub:
            raise GoogleAuthError(
                "This ProFit account is already connected to a different Google account. Disconnect it first.",
                status_code=409,
                code="already_linked_other",
            )
        if User.objects.filter(google_sub=claims.sub).exclude(pk=locked.pk).exists():
            raise GoogleAuthError(
                "This Google account is already connected to another ProFit account.",
                status_code=409,
                code="google_sub_in_use",
            )
        update_fields = []
        if locked.google_sub != claims.sub:
            locked.google_sub = claims.sub
            locked.google_linked_at = timezone.now()
            update_fields.extend(["google_sub", "google_linked_at"])
        if locked.google_email != claims.email:
            locked.google_email = claims.email
            update_fields.append("google_email")
        if update_fields:
            locked.save(update_fields=update_fields)
        return locked


def disconnect_google_account(user: User) -> User:
    """Disconnect Google from an authenticated user, refusing if it would lock them out."""
    if not user or not user.is_authenticated or not user.is_active:
        raise GoogleAuthError("Sign in to an active account first.", status_code=401, code="not_authenticated")

    with transaction.atomic():
        locked = User.objects.select_for_update().filter(pk=user.pk).first()
        if locked is None or not locked.is_active:
            raise GoogleAuthError("Account is not active.", status_code=403, code="account_disabled")
        if not locked.google_sub:
            return locked
        if not locked.has_usable_password():
            raise GoogleAuthError(
                "Set a password before disconnecting Google so you do not get locked out of your account.",
                status_code=400,
                code="lockout_prevented",
            )
        locked.google_sub = None
        locked.google_email = ""
        locked.google_linked_at = None
        locked.save(update_fields=["google_sub", "google_email", "google_linked_at"])
        return locked
