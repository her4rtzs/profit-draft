"""Create local demo accounts (owner, coach, member) for trying the app.

Refuses to run unless DEBUG is on, so the demo password can never be created in
production. Usage: python manage.py seed_demo_accounts
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.membership.models import MemberProfile

DEMO_PASSWORD = "demo-pass-123"  # local development only


class Command(BaseCommand):
    help = "Create demo owner, trainer and member accounts (DEBUG only)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo_accounts only runs with DEBUG=True.")
        User = get_user_model()
        accounts = [
            ("owner", "owner@example.com", "OWNER", "Gym Owner"),
            ("coach", "coach@example.com", "TRAINER", "Coach Mika"),
            ("member", "member@example.com", "MEMBER", "Demo Member"),
        ]
        for username, email, role, name in accounts:
            first, _, last = name.partition(" ")
            user, _ = User.objects.update_or_create(
                username=username,
                defaults={"email": email, "role": role, "first_name": first, "last_name": last},
            )
            user.set_password(DEMO_PASSWORD)
            user.save()
            if role == "MEMBER":
                MemberProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "membership_status": MemberProfile.MembershipStatus.ACTIVE,
                        "expiry_date": timezone.localdate() + timedelta(days=30),
                    },
                )
        self.stdout.write(f"Demo accounts ready: owner, coach, member. Password: {DEMO_PASSWORD}")
