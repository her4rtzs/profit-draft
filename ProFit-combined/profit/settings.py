"""
Django settings for the ProFit project.

Environment-driven configuration (django-environ) with an offline SQLite
fallback for local development, and a production target of Vercel serverless
functions backed by Supabase PostgreSQL (transaction-mode pooler).

LOGGING POLICY: never log PII (names, contact details) or payment details
(amounts, PayMongo IDs, card/wallet data). Loggers configured below must only
record non-sensitive identifiers and status/outcome enums.
"""

import logging
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Environment ----------------------------------------------------------

env = environ.Env()
# Read a local .env file when present; a no-op when absent (offline-friendly).
environ.Env.read_env(BASE_DIR / ".env")

# SECRET_KEY from env, with a clearly-insecure dev fallback for local use only.
SECRET_KEY = env("SECRET_KEY", default="dev-insecure-key-not-for-production")

DEBUG = env.bool("DEBUG", default=True)

# ALLOWED_HOSTS from a CSV env value.
#   DEBUG=True  -> fall back to localhost when unset.
#   DEBUG=False -> require the value; fail fast rather than silently localhost.
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=[])
if not ALLOWED_HOSTS:
    if DEBUG:
        ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
    else:
        raise ImproperlyConfigured(
            "ALLOWED_HOSTS must be set when DEBUG=False. Refusing to fall "
            "back to localhost in a non-debug environment."
        )

# Optionally seed from Vercel's provided deployment host.
VERCEL_URL = env("VERCEL_URL", default="")
if VERCEL_URL and VERCEL_URL not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(VERCEL_URL)

# --- Applications ----------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_components",
    "apps.accounts",
    "apps.membership",
    "apps.billing",
    "apps.finance",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serves static files; must sit immediately after SecurityMiddleware.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "profit.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        # APP_DIRS must be disabled when explicit "loaders" are configured; the
        # app-directories behavior is provided by the loader list below.
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
            "loaders": [
                "django.template.loaders.filesystem.Loader",
                "django.template.loaders.app_directories.Loader",
                "django_components.template_loader.Loader",
            ],
        },
    },
]

WSGI_APPLICATION = "profit.wsgi.application"

# --- Database --------------------------------------------------------------
# Offline default is SQLite; production sets DATABASE_URL to the Supabase
# transaction-mode pooler endpoint (host on port 6543).
DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
    )
}

# Supabase transaction-mode pooler safety, applied UNCONDITIONALLY (harmless on
# SQLite) so there is no environment-dependent branch that passes locally but
# fails in production.
DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
DATABASES["default"]["CONN_MAX_AGE"] = 0

# Advisory-only guardrail: in production, warn if the configured DB endpoint is
# the direct connection (5432) rather than the transaction-mode pooler (6543).
# Log only the port number, never host/user/credentials.
if not DEBUG:
    _db = DATABASES["default"]
    _engine = _db.get("ENGINE", "")
    if "postgresql" in _engine:
        _port = str(_db.get("PORT") or "")
        if not _port:
            # Normalize empty port to the scheme default for PostgreSQL.
            _port = "5432"
        if _port == "5432":
            logging.getLogger("profit.settings").warning(
                "DATABASE endpoint port is %s (direct connection); expected the "
                "Supabase transaction-mode pooler on port 6543.",
                _port,
            )

# --- Authentication --------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"

# Member-auth HTML pages (plain Django views under /accounts/).
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# PASSWORD_HASHERS left at Django's default (Argon2 first); argon2-cffi is
# installed so the preferred hasher is available.

# --- PayMongo --------------------------------------------------------------
# Webhook signature-verification secret (whsk_ prefix in production). Empty by
# default so the project runs offline; the webhook rejects (400) any event when
# the secret is unset. NEVER log or echo this value.
PAYMONGO_WEBHOOK_SECRET = env("PAYMONGO_WEBHOOK_SECRET", default="")

# --- Email (Resend) --------------------------------------------------------
# When RESEND_API_KEY is set, outbound mail goes through the stdlib-only
# ResendEmailBackend. With no key, the console backend is used (DEBUG only);
# an unset key with DEBUG=False fails fast so OTP codes never leak to logs.
# NEVER log or echo RESEND_API_KEY.
from apps.accounts.email_backends import select_email_backend  # noqa: E402

RESEND_API_KEY = env("RESEND_API_KEY", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="ProFit <onboarding@resend.dev>")
SITE_BASE_URL = env("SITE_BASE_URL", default="http://localhost:8000")
EMAIL_BACKEND = select_email_backend(RESEND_API_KEY, DEBUG)

# --- Internationalization --------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

# --- Static files (WhiteNoise) ---------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [
    BASE_DIR / "static" / "dist",
    BASE_DIR / "static" / "vendor",
]

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# --- Security (DEBUG-gated) -------------------------------------------------
# HTTPS is mandatory in production; relaxed for local HTTP development.
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SECURE_HSTS_SECONDS = 0

# The web app (plain HTML/CSS/JS) is served from web/ at the site root, so pages,
# manifest and service worker share one origin: no CORS, cookies just work.
WHITENOISE_ROOT = BASE_DIR / "web"
WHITENOISE_INDEX_FILE = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Django REST Framework -------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# --- django-components ------------------------------------------------------
# Loader wired into TEMPLATES above; component source directory registered here.
# autodiscover stays disabled: the local .venv lives under BASE_DIR, and leaving
# autodiscover on risks the tree-walk importing packages outside our control.
# Instead we register components explicitly through COMPONENTS["libraries"],
# which django_components imports at startup (import_libraries runs regardless
# of autodiscover). Each listed module calls @register on import.
COMPONENTS = {
    "dirs": [BASE_DIR / "components"],
    "autodiscover": False,
    "libraries": [
        "components.button.button",
        "components.icon.icon",
    ],
}

# --- Logging ----------------------------------------------------------------
# POLICY (restated): never log PII or payment details. Handlers below emit only
# non-sensitive identifiers and status/outcome enums.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
