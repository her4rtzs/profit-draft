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
            tables = set(connection.introspection.table_names(cursor))
            user_cols = {c.name for c in connection.introspection.get_table_description(cursor, "accounts_user")}
            trainer_cols = {c.name for c in connection.introspection.get_table_description(cursor, "trainers_trainerprofile")}
            member_cols = (
                {c.name for c in connection.introspection.get_table_description(cursor, "membership_memberprofile")}
                if "membership_memberprofile" in tables
                else set()
            )
            manual_pay_cols = (
                {c.name for c in connection.introspection.get_table_description(cursor, "finance_manualpayment")}
                if "finance_manualpayment" in tables
                else set()
            )

        needs_migrate = (
            "must_change_password" not in user_cols
            or "google_sub" not in user_cols
            or "avatar_data" not in user_cols
            or "phone" not in trainer_cols
            or ("membership_memberprofile" in tables and "trial_ends_at" not in member_cols)
            or "billing_paymentclaim" not in tables
            or ("finance_manualpayment" in tables and "reference_number" not in manual_pay_cols)
        )
        if needs_migrate:
            try:
                call_command("migrate", interactive=False, verbosity=0)
            except Exception:
                with connection.cursor() as cursor:
                    if "must_change_password" not in user_cols:
                        cursor.execute(
                            "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;"
                        )
                    if "avatar_data" not in user_cols:
                        cursor.execute(
                            "ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS avatar_data text NOT NULL DEFAULT '';"
                        )
                    if "phone" not in trainer_cols:
                        cursor.execute(
                            "ALTER TABLE trainers_trainerprofile ADD COLUMN IF NOT EXISTS phone varchar(40) NOT NULL DEFAULT '';"
                        )
                    if "membership_memberprofile" in tables and "trial_ends_at" not in member_cols:
                        cursor.execute(
                            "ALTER TABLE membership_memberprofile ADD COLUMN IF NOT EXISTS trial_ends_at timestamp with time zone NULL;"
                        )
                    if "finance_manualpayment" in tables and "reference_number" not in manual_pay_cols:
                        cursor.execute(
                            "ALTER TABLE finance_manualpayment ADD COLUMN IF NOT EXISTS reference_number varchar(64) NULL;"
                        )

        from django.contrib.auth import get_user_model
        from apps.accounts.google_auth import ensure_google_user_columns
        from apps.accounts.management.commands.seed_demo_accounts import DEMO_PASSWORD

        ensure_google_user_columns()
        User = get_user_model()
        cashier = User.objects.filter(email__iexact="joyce.cashier@gmail.com").first()
        if cashier is None:
            cashier, created = User.objects.get_or_create(
                username="cashier",
                defaults={
                    "email": "joyce.cashier@gmail.com",
                    "role": "CASHIER",
                    "first_name": "Joyce",
                    "last_name": "Cashier",
                    "is_active": True,
                },
            )
            if created or not cashier.has_usable_password():
                cashier.set_password(DEMO_PASSWORD)
                cashier.save()
        else:
            changed = []
            if cashier.role != "CASHIER":
                cashier.role = "CASHIER"
                changed.append("role")
            if not cashier.is_active:
                cashier.is_active = True
                changed.append("is_active")
            if not cashier.has_usable_password():
                cashier.set_password(DEMO_PASSWORD)
                changed.append("password")
            if changed:
                cashier.save(update_fields=changed)
    except Exception:
        pass


_ensure_pending_migrations()
