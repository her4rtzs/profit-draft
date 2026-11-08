"""Trainer assignment: capacity, change and removal with alerts, and member requests."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.membership.models import Attendance, MemberProfile
from apps.notifications.models import Notification
from apps.trainers import services
from apps.trainers.models import TrainerAssignment, TrainerProfile, TrainerRequest

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"


class TrainerTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner@gym.test", email="owner@gym.test", password=PASSWORD, role="OWNER")
        self.t1_user = User.objects.create_user(username="t1@gym.test", email="t1@gym.test", password=PASSWORD, role="TRAINER", first_name="Mika")
        self.t2_user = User.objects.create_user(username="t2@gym.test", email="t2@gym.test", password=PASSWORD, role="TRAINER", first_name="Rey")
        self.t1 = TrainerProfile.objects.create(user=self.t1_user, specialization="HIIT", max_members=1)
        self.t2 = TrainerProfile.objects.create(user=self.t2_user, specialization="Strength", max_members=10)
        self.m_user = User.objects.create_user(username="m@gym.test", email="m@gym.test", password=PASSWORD, role="MEMBER", first_name="Ana")
        self.m2_user = User.objects.create_user(username="m2@gym.test", email="m2@gym.test", password=PASSWORD, role="MEMBER", first_name="Ben")
        self.m = MemberProfile.objects.create(user=self.m_user, membership_status="ACTIVE")
        self.m2 = MemberProfile.objects.create(user=self.m2_user, membership_status="ACTIVE")

    def test_assign_notifies_member_and_trainer(self):
        services.assign_trainer(self.m, self.t2, actor=self.owner)
        self.assertEqual(services.current_assignment(self.m).trainer, self.t2)
        self.assertEqual(Notification.objects.filter(recipient=self.m_user, kind="TRAINER").count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.t2_user, kind="TRAINER").count(), 1)

    def test_change_ends_the_old_assignment_and_notifies_the_old_trainer(self):
        services.assign_trainer(self.m, self.t2, actor=self.owner)
        services.assign_trainer(self.m, self.t1, actor=self.owner)
        self.assertEqual(services.current_assignment(self.m).trainer, self.t1)
        self.assertEqual(TrainerAssignment.objects.filter(member=self.m, ended_at__isnull=False).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.t2_user, kind="TRAINER").count(), 2)

    def test_full_trainer_refuses_a_new_member(self):
        services.assign_trainer(self.m, self.t1, actor=self.owner)
        with self.assertRaises(Exception):
            services.assign_trainer(self.m2, self.t1, actor=self.owner)

    def test_remove_clears_the_assignment(self):
        services.assign_trainer(self.m, self.t2, actor=self.owner)
        services.remove_trainer(self.m, actor=self.owner)
        self.assertIsNone(services.current_assignment(self.m))

    def test_member_request_then_owner_approves(self):
        req = services.request_trainer(self.m, trainer=self.t2, note="Want strength work")
        self.assertEqual(req.status, "PENDING")
        self.assertEqual(Notification.objects.filter(recipient=self.owner, kind="TRAINER").count(), 1)
        services.decide_request(req, approve=True, actor=self.owner)
        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED")
        self.assertEqual(services.current_assignment(self.m).trainer, self.t2)

    def test_decline_does_not_assign_and_tells_the_member(self):
        req = services.request_trainer(self.m)
        services.decide_request(req, approve=False, actor=self.owner)
        self.assertIsNone(services.current_assignment(self.m))
        self.assertEqual(Notification.objects.filter(recipient=self.m_user, title="Trainer request declined").count(), 1)

    def test_only_one_pending_request_at_a_time(self):
        services.request_trainer(self.m)
        with self.assertRaises(Exception):
            services.request_trainer(self.m)

    def test_only_pending_requests_can_be_cancelled(self):
        req = services.request_trainer(self.m)
        services.cancel_request(req)
        req.refresh_from_db()
        self.assertEqual(req.status, TrainerRequest.Status.CANCELLED)
        with self.assertRaises(Exception):
            services.cancel_request(req)

    def test_trainer_endpoints_profile_and_members(self):
        # Assign m to t1
        services.assign_trainer(self.m, self.t1, actor=self.owner)

        # 1. Unauthenticated gets 401/403
        res = self.client.get("/api/trainer/profile/")
        self.assertIn(res.status_code, (401, 403))

        # 2. Member gets 403
        self.client.force_login(self.m_user)
        res = self.client.get("/api/trainer/profile/")
        self.assertEqual(res.status_code, 403)

        # 3. Trainer can get own profile
        self.client.force_login(self.t1_user)
        res = self.client.get("/api/trainer/profile/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "Mika")
        self.assertEqual(res.json()["load"], 1)

        # 4. Trainer can update own profile
        res = self.client.patch("/api/trainer/profile/", {"specialization": "Kettlebell & HIIT", "availability": "Mon-Fri 7AM-1PM"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.t1.refresh_from_db()
        self.assertEqual(self.t1.specialization, "Kettlebell & HIIT")

        # 5. Trainer can get assigned members
        res = self.client.get("/api/trainer/members/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.m.pk)
        self.assertEqual(data[0]["name"], "Ana")

        # 6. Trainer dashboard
        res = self.client.get("/api/trainer/dashboard/")
        self.assertEqual(res.status_code, 200)
        dash = res.json()
        self.assertEqual(dash["stats"]["assigned_members"], 1)
        self.assertEqual(dash["stats"]["active_members"], 1)
        self.assertEqual(dash["stats"]["expiring_soon_members"], 0)
        self.assertEqual(dash["stats"]["expired_members"], 0)

        # 7. Trainer schedule note sends notification
        res = self.client.post("/api/trainer/schedule/note/", {"session_name": "Sunrise HIIT", "note": "Moving to Studio 2"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(Notification.objects.filter(recipient=self.m_user, kind="TRAINER", title__contains="Sunrise HIIT").exists())

    def test_attendance_week_bucketing_across_month_boundaries(self):
        """Monday-start week spanning Sep 28 – Oct 4 aggregates Sep and Oct check-ins into one bucket."""
        self.m.date_joined = timezone.datetime(2026, 9, 1).date()
        self.m.save(update_fields=["date_joined"])
        services.assign_trainer(self.m, self.t1, actor=self.owner)

        # Create check-ins on Tue Sep 29, 2026 and Thu Oct 1, 2026 (Manila time)
        tz = timezone.get_current_timezone()
        Attendance.objects.create(
            member=self.m,
            recorded_by=self.t1_user,
            check_in_at=timezone.datetime(2026, 9, 29, 9, 0, tzinfo=tz),
        )
        Attendance.objects.create(
            member=self.m,
            recorded_by=self.t1_user,
            check_in_at=timezone.datetime(2026, 10, 1, 10, 0, tzinfo=tz),
        )

        self.client.force_login(self.t1_user)
        res = self.client.get(
            f"/api/trainer/attendance/?granularity=week&from=2026-09-28&to=2026-10-04&member_id={self.m.pk}"
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertEqual(payload["granularity"], "week")
        self.assertEqual(payload["from"], "2026-09-28")
        self.assertEqual(payload["to"], "2026-10-04")
        self.assertEqual(len(payload["buckets"]), 1)

        bucket = payload["buckets"][0]
        self.assertEqual(bucket["start"], "2026-09-28")
        self.assertEqual(bucket["label"], "Sep 28")
        self.assertEqual(bucket["checked_in"], 2)
        self.assertEqual(bucket["scheduled"], 7)
        self.assertEqual(bucket["missed"], 5)
        self.assertAlmostEqual(bucket["attendance_rate"], round(2 / 7 * 100, 1))
        self.assertEqual(payload["summary"]["checked_in"], 2)
        self.assertEqual(payload["summary"]["scheduled"], 7)

    def test_attendance_scheduled_zero_returns_null_rate(self):
        """When scheduled is 0 for a bucket or summary, attendance_rate is None (JSON null)."""
        self.m.membership_status = MemberProfile.MembershipStatus.PENDING
        self.m.save(update_fields=["membership_status"])
        services.assign_trainer(self.m, self.t1, actor=self.owner)

        self.client.force_login(self.t1_user)
        res = self.client.get(
            "/api/trainer/attendance/?granularity=day&from=2026-10-01&to=2026-10-03&member_id=all"
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertEqual(payload["summary"]["scheduled"], 0)
        self.assertEqual(payload["summary"]["checked_in"], 0)
        self.assertIsNone(payload["summary"]["attendance_rate"])
        for b in payload["buckets"]:
            self.assertEqual(b["scheduled"], 0)
            self.assertEqual(b["missed"], 0)
            self.assertIsNone(b["attendance_rate"])

    def test_trainer_attendance_series_rbac_and_bucket_cap(self):
        services.assign_trainer(self.m, self.t1, actor=self.owner)
        today = timezone.localdate()
        Attendance.objects.create(member=self.m, recorded_by=self.t1_user)
        Attendance.objects.create(member=self.m2, recorded_by=self.t2_user)

        self.client.force_login(self.t1_user)

        # Query assigned member attendance series (with swapped dates to test auto-swap)
        res = self.client.get(
            f"/api/trainer/attendance/?granularity=day&from={today.isoformat()}&to={(today - timezone.timedelta(days=3)).isoformat()}&member_id={self.m.pk}"
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertEqual(payload["granularity"], "day")
        self.assertEqual(payload["from"], (today - timezone.timedelta(days=3)).isoformat())
        self.assertEqual(payload["to"], today.isoformat())
        self.assertEqual(payload["summary"]["checked_in"], 1)
        self.assertEqual(len(payload["buckets"]), 4)

        # Querying unassigned member (self.m2) returns 403 Forbidden with specific message
        res_forbidden = self.client.get(
            f"/api/trainer/attendance/?granularity=day&member_id={self.m2.pk}"
        )
        self.assertEqual(res_forbidden.status_code, 403)
        self.assertEqual(
            res_forbidden.json()["detail"],
            f"Member {self.m2.pk} is not assigned to this trainer.",
        )

        # Malformed non-numeric member_id returns 400 Bad Request
        res_malformed = self.client.get(
            "/api/trainer/attendance/?granularity=day&member_id=Joyce%20Alvarez"
        )
        self.assertEqual(res_malformed.status_code, 400)
        self.assertIn("Malformed member_id", res_malformed.json()["detail"])

        # Requesting > 60 buckets returns 400 Bad Request with error detail
        res_too_large = self.client.get(
            "/api/trainer/attendance/?granularity=day&from=2026-01-01&to=2026-06-01&member_id=all"
        )
        self.assertEqual(res_too_large.status_code, 400)
        self.assertIn("detail", res_too_large.json())

    def test_joyce_alvarez_and_angelo_metillo_oct26_to_nov8_and_unassigned_403(self):
        """Valid assigned member_ids (Joyce Alvarez & Angelo Metillo) return 200 with buckets for Oct 26 - Nov 8, and unassigned returns 403."""
        joyce_user = User.objects.create_user(
            username="joyce@gym.test",
            email="joyce@gym.test",
            password=PASSWORD,
            role="MEMBER",
            first_name="Joyce",
            last_name="Alvarez",
        )
        angelo_user = User.objects.create_user(
            username="angelo@gym.test",
            email="angelo@gym.test",
            password=PASSWORD,
            role="MEMBER",
            first_name="Angelo",
            last_name="Metillo",
        )
        joyce = MemberProfile.objects.create(
            user=joyce_user,
            membership_status="ACTIVE",
            date_joined=timezone.datetime(2026, 9, 1).date(),
        )
        angelo = MemberProfile.objects.create(
            user=angelo_user,
            membership_status="ACTIVE",
            date_joined=timezone.datetime(2026, 9, 1).date(),
        )

        services.assign_trainer(joyce, self.t2, actor=self.owner)
        services.assign_trainer(angelo, self.t2, actor=self.owner)

        tz = timezone.get_current_timezone()
        Attendance.objects.create(
            member=joyce,
            recorded_by=self.t2_user,
            check_in_at=timezone.datetime(2026, 10, 29, 9, 0, tzinfo=tz),
        )
        Attendance.objects.create(
            member=angelo,
            recorded_by=self.t2_user,
            check_in_at=timezone.datetime(2026, 10, 30, 0, 5, tzinfo=tz),
        )

        self.client.force_login(self.t2_user)

        # 1. Joyce Alvarez returns 200 with 14 buckets for Oct 26 to Nov 8
        res_joyce = self.client.get(
            f"/api/trainer/attendance/?granularity=day&from=2026-10-26&to=2026-11-08&member_id={joyce.pk}"
        )
        self.assertEqual(res_joyce.status_code, 200)
        joyce_data = res_joyce.json()
        self.assertEqual(joyce_data["member_id"], joyce.pk)
        self.assertEqual(len(joyce_data["buckets"]), 14)
        self.assertEqual(joyce_data["summary"]["checked_in"], 1)
        self.assertEqual(joyce_data["summary"]["scheduled"], 14)
        self.assertEqual(
            [m["id"] for m in joyce_data["assigned_members"]],
            sorted([joyce.pk, angelo.pk]),
        )

        # 2. Angelo Metillo returns 200 with 14 buckets for Oct 26 to Nov 8
        res_angelo = self.client.get(
            f"/api/trainer/attendance/?granularity=day&from=2026-10-26&to=2026-11-08&member_id={angelo.pk}"
        )
        self.assertEqual(res_angelo.status_code, 200)
        angelo_data = res_angelo.json()
        self.assertEqual(angelo_data["member_id"], angelo.pk)
        self.assertEqual(len(angelo_data["buckets"]), 14)
        self.assertEqual(angelo_data["summary"]["checked_in"], 1)
        self.assertEqual(angelo_data["summary"]["scheduled"], 14)

        # 3. Unassigned member (self.m) returns 403
        res_unassigned = self.client.get(
            f"/api/trainer/attendance/?granularity=day&from=2026-10-26&to=2026-11-08&member_id={self.m.pk}"
        )
        self.assertEqual(res_unassigned.status_code, 403)
        self.assertEqual(
            res_unassigned.json()["detail"],
            f"Member {self.m.pk} is not assigned to this trainer.",
        )




