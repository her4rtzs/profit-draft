"""Vercel serverless entry point.

@vercel/python imports the WSGI callable named ``app`` from this module and
invokes it directly (there is no gunicorn / long-lived process).

NIT-3: serving static files with WhiteNoise from inside this function is a
deliberate first-build choice; CDN optimization is deferred to a later pass.
"""

from profit.wsgi import application as app  # noqa: F401  (Vercel imports `app`)


def _ensure_pending_migrations():
    """Ensure new columns on accounts_user and trainers_trainerprofile exist on Vercel cold start."""
    try:
        from django.core.management import call_command
        from django.db import connection

        if "sqlite" in connection.settings_dict.get("ENGINE", ""):
            return
        with connection.cursor() as cursor:
            user_cols = {c.name for c in connection.introspection.get_table_description(cursor, "accounts_user")}
            trainer_cols = {c.name for c in connection.introspection.get_table_description(cursor, "trainers_trainerprofile")}

        if "must_change_password" not in user_cols:
            try:
                call_command("migrate", "accounts", interactive=False, verbosity=0)
            except Exception:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;"
                    )

        if "phone" not in trainer_cols:
            try:
                call_command("migrate", "trainers", interactive=False, verbosity=0)
            except Exception:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "ALTER TABLE trainers_trainerprofile ADD COLUMN IF NOT EXISTS phone varchar(40) NOT NULL DEFAULT '';"
                    )
    except Exception:
        pass


_ensure_pending_migrations()
