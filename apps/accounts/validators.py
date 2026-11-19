"""Email validation helpers enforcing real Gmail syntax and blocking disposable domains."""

import re

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

_GMAIL_DOMAINS = frozenset({"gmail.com", "googlemail.com"})

_GMAIL_TYPO_DOMAINS = frozenset({
    "gmai.com",
    "gmial.com",
    "gamil.com",
    "gmail.co",
    "gmail.con",
    "gmail.ph",
    "gmal.com",
    "gmail.net",
    "gmail.org",
    "gmail.c",
    "googlemai.com",
})

_DISPOSABLE_DOMAINS = frozenset({
    "mailinator.com",
    "tempmail.com",
    "temp-mail.org",
    "10minutemail.com",
    "guerrillamail.com",
    "yopmail.com",
    "trashmail.com",
    "fakeinbox.com",
    "sharklasers.com",
    "getnada.com",
    "dispostable.com",
    "maildrop.cc",
    "throwawaymail.com",
    "fake.com",
    "invalid.com",
})

_FAKE_GMAIL_USERNAMES = frozenset({
    "test",
    "testing",
    "tester",
    "example",
    "sample",
    "fake",
    "fakemail",
    "admin",
    "user",
    "username",
    "member",
    "nobody",
    "noemail",
    "noreply",
    "none",
    "null",
    "qwerty",
    "asdfgh",
    "zxcvbn",
    "abcdef",
    "abcdefg",
    "abcdefgh",
    "password",
    "demo",
})

_GMAIL_LOCAL_RE = re.compile(r"^[a-z0-9]+(?:\.[a-z0-9]+)*$")


def validate_real_email(email: str) -> str:
    """Normalize and validate ``email``, rejecting typos, disposable domains, and fake Gmails."""
    norm = (email or "").strip().lower()
    if not norm:
        raise ValidationError("Enter a valid email address.")
    validate_email(norm)

    local, _, domain = norm.partition("@")
    if domain in _GMAIL_TYPO_DOMAINS:
        raise ValidationError("Enter a valid Gmail address ending in @gmail.com.")
    if domain in _DISPOSABLE_DOMAINS:
        raise ValidationError("Please use a real, permanent email address.")

    if domain in _GMAIL_DOMAINS:
        base_local = local.split("+", 1)[0]
        if not (6 <= len(base_local) <= 30):
            raise ValidationError("Enter a real Gmail address (username must be 6 to 30 characters).")
        if not _GMAIL_LOCAL_RE.match(base_local):
            raise ValidationError("Enter a valid Gmail address (letters, numbers, and single dots only).")
        if not any("a" <= ch <= "z" for ch in base_local):
            raise ValidationError("Enter a real Gmail address (cannot be numbers only).")
        dotless = base_local.replace(".", "")
        if base_local in _FAKE_GMAIL_USERNAMES or dotless in _FAKE_GMAIL_USERNAMES:
            raise ValidationError("Please use a real, personal Gmail address.")

    return norm
