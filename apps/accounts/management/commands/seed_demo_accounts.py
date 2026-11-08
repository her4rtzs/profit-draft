"""Create local demo accounts (owner, coach, member) for trying the app.

Refuses to run unless DEBUG is on, so the demo password can never be created in
production. Usage: python manage.py seed_demo_accounts
"""

from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.membership.models import Attendance, MemberProfile
from apps.trainers.models import TrainerAssignment, TrainerProfile

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
            ("joyce", "joyce.alvarez@example.com", "MEMBER", "Joyce Alvarez"),
            ("angelo", "angelo.metillo@example.com", "MEMBER", "Angelo Metillo"),
        ]
        created_users = {}
        for username, email, role, name in accounts:
            first, _, last = name.partition(" ")
            user, _ = User.objects.update_or_create(
                username=username,
                defaults={"email": email, "role": role, "first_name": first, "last_name": last},
            )
            user.set_password(DEMO_PASSWORD)
            user.save()
            created_users[username] = user
            if role == "MEMBER":
                MemberProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "membership_status": MemberProfile.MembershipStatus.ACTIVE,
                        "date_joined": date(2026, 9, 1),
                        "expiry_date": timezone.localdate() + timedelta(days=30),
                    },
                )

        coach_user = created_users["coach"]
        trainer_profile, _ = TrainerProfile.objects.update_or_create(
            user=coach_user,
            defaults={
                "specialization": "HIIT & Functional Strength",
                "max_members": 20,
                "is_active": True,
            },
        )

        # Assign Joyce Alvarez and Angelo Metillo to Coach Mika and seed check-ins for Oct 26 - Nov 8
        tz = timezone.get_current_timezone()
        checkin_schedule = {
            "joyce": [
                date(2026, 10, 26),
                date(2026, 10, 27),
                date(2026, 10, 29),
                date(2026, 10, 31),
                date(2026, 11, 2),
                date(2026, 11, 3),
                date(2026, 11, 5),
                date(2026, 11, 7),
            ],
            "angelo": [
                date(2026, 10, 26),
                date(2026, 10, 27),
                date(2026, 10, 29),
                date(2026, 10, 30),
                date(2026, 11, 2),
                date(2026, 11, 4),
                date(2026, 11, 5),
                date(2026, 11, 7),
            ],
        }
        for uname, days in checkin_schedule.items():
            m_profile = MemberProfile.objects.get(user=created_users[uname])
            TrainerAssignment.objects.get_or_create(
                member=m_profile,
                ended_at__isnull=True,
                defaults={"trainer": trainer_profile},
            )
            for d in days:
                if not Attendance.objects.filter(member=m_profile, check_in_date=d).exists():
                    Attendance.objects.create(
                        member=m_profile,
                        recorded_by=coach_user,
                        check_in_at=timezone.datetime(d.year, d.month, d.day, 9, 0, tzinfo=tz),
                    )

        self.stdout.write(f"Demo accounts ready: owner, coach, member, joyce, angelo. Password: {DEMO_PASSWORD}")
