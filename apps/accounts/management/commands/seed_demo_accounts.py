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
            ("namjoon", "namjoon@example.com", "MEMBER", "Kim Namjoon"),
            ("seokjin", "seokjin@example.com", "MEMBER", "Kim Seokjin"),
            ("hoseok", "hoseok@example.com", "MEMBER", "Jung Hoseok"),
            ("maria", "maria.santos@example.com", "MEMBER", "Maria Santos"),
            ("carlo", "carlo.ramos@example.com", "MEMBER", "Carlo Ramos"),
            ("yoongi", "yoongi@example.com", "MEMBER", "Min Yoongi"),
            ("jose", "jose.reyes@example.com", "MEMBER", "Jose Reyes"),
            ("liza", "liza.mendoza@example.com", "MEMBER", "Liza Mendoza"),
            ("gian", "gian.delatorre@example.com", "MEMBER", "Gian Dela Torre"),
            ("karen", "karen.reyes@example.com", "MEMBER", "Karen Reyes"),
            ("james", "james.mendoza@example.com", "MEMBER", "James Mendoza"),
            ("daniel", "daniel.lopez@example.com", "MEMBER", "Daniel Lopez"),
            ("sophia", "sophia.martinez@example.com", "MEMBER", "Sophia Martinez"),
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

        # Assign Joyce Alvarez and Angelo Metillo to Coach Mika and seed check-ins for Sep 14 - Nov 8 (8 weeks)
        tz = timezone.get_current_timezone()
        checkin_schedule = {
            "joyce": [
                # Sep 14 - Sep 20
                date(2026, 9, 14), date(2026, 9, 16), date(2026, 9, 18), date(2026, 9, 20),
                # Sep 21 - Sep 27
                date(2026, 9, 22), date(2026, 9, 23), date(2026, 9, 25), date(2026, 9, 26), date(2026, 9, 27),
                # Sep 28 - Oct 4
                date(2026, 9, 29), date(2026, 9, 30), date(2026, 10, 2), date(2026, 10, 3),
                # Oct 5 - Oct 11
                date(2026, 10, 6), date(2026, 10, 7), date(2026, 10, 8), date(2026, 10, 10),
                # Oct 12 - Oct 18
                date(2026, 10, 13), date(2026, 10, 14), date(2026, 10, 16), date(2026, 10, 17), date(2026, 10, 18),
                # Oct 19 - Oct 25
                date(2026, 10, 20), date(2026, 10, 21), date(2026, 10, 23), date(2026, 10, 24),
                # Oct 26 - Nov 1
                date(2026, 10, 26), date(2026, 10, 27), date(2026, 10, 29), date(2026, 10, 31),
                # Nov 2 - Nov 8
                date(2026, 11, 2), date(2026, 11, 3), date(2026, 11, 5), date(2026, 11, 7),
            ],
            "angelo": [
                # Sep 14 - Sep 20 (5)
                date(2026, 9, 14), date(2026, 9, 15), date(2026, 9, 16), date(2026, 9, 18), date(2026, 9, 19),
                # Sep 21 - Sep 27 (4)
                date(2026, 9, 21), date(2026, 9, 22), date(2026, 9, 24), date(2026, 9, 25),
                # Sep 28 - Oct 4 (4)
                date(2026, 9, 28), date(2026, 9, 29), date(2026, 10, 1), date(2026, 10, 2),
                # Oct 5 - Oct 11 (5)
                date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7), date(2026, 10, 9), date(2026, 10, 10),
                # Oct 12 - Oct 18 (4)
                date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 15), date(2026, 10, 16),
                # Oct 19 - Oct 25 (5)
                date(2026, 10, 19), date(2026, 10, 20), date(2026, 10, 21), date(2026, 10, 23), date(2026, 10, 24),
                # Oct 26 - Nov 1 (4)
                date(2026, 10, 26), date(2026, 10, 27), date(2026, 10, 29), date(2026, 10, 30),
                # Nov 2 - Nov 8 (4)
                date(2026, 11, 2), date(2026, 11, 4), date(2026, 11, 5), date(2026, 11, 7),
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

        owner_user = created_users["owner"]
        from apps.finance.models import ManualPayment
        member_plans = {
            "joyce": "monthly",
            "angelo": "monthly",
            "member": "monthly",
            "namjoon": "monthly",
            "seokjin": "monthly",
            "hoseok": "monthly",
            "maria": "monthly",
            "carlo": "monthly",
            "yoongi": "quarterly",
            "jose": "quarterly",
            "liza": "quarterly",
            "gian": "quarterly",
            "karen": "annual",
            "james": "annual",
            "daniel": "other",
            "sophia": "other",
        }
        plan_prices = {
            "monthly": 80000,
            "quarterly": 210000,
            "annual": 750000,
            "other": 50000,
        }
        for uname, plan_name in member_plans.items():
            u = created_users.get(uname)
            if not u:
                continue
            mp = MemberProfile.objects.get(user=u)
            ManualPayment.objects.get_or_create(
                member=mp,
                plan=plan_name,
                defaults={
                    "method": "GCASH" if uname in ["joyce", "namjoon", "yoongi", "liza", "james", "sophia"] else "CASH",
                    "amount_centavos": plan_prices.get(plan_name, 80000),
                    "paid_on": timezone.localdate(),
                    "recorded_by": owner_user,
                },
            )

        self.stdout.write(f"Demo accounts ready: owner, coach, member, joyce, angelo. Password: {DEMO_PASSWORD}")
