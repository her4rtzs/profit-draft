"""Management command to verify announcements schema, table columns, and migrations."""

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Inspect announcements database tables, event_date column, and migration state."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply any unapplied announcements migrations safely.",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Checking announcements schema on active database..."))

        with connection.cursor() as cursor:
            tables = connection.introspection.table_names(cursor)
            has_table = "announcements_announcement" in tables
            has_m2m = "announcements_announcement_recipients" in tables

            has_event_date = False
            if has_table:
                columns = [col.name for col in connection.introspection.get_table_description(cursor, "announcements_announcement")]
                has_event_date = "event_date" in columns

        self.stdout.write(f"  announcements_announcement table: {'EXISTS' if has_table else 'MISSING'}")
        self.stdout.write(f"  announcements_announcement_recipients table: {'EXISTS' if has_m2m else 'MISSING'}")
        self.stdout.write(f"  event_date column: {'EXISTS' if has_event_date else 'MISSING'}")

        if not has_table or not has_event_date:
            self.stdout.write(self.style.WARNING("Schema is incomplete."))
            if options.get("apply"):
                self.stdout.write(self.style.NOTICE("Applying announcements migrations..."))
                call_command("migrate", "announcements", interactive=False)
                self.stdout.write(self.style.SUCCESS("Announcements migrations applied successfully!"))
            else:
                self.stdout.write("Run with --apply or execute supabase/announcements_migration.sql to complete schema.")
        else:
            self.stdout.write(self.style.SUCCESS("All announcements tables and columns are properly configured!"))

