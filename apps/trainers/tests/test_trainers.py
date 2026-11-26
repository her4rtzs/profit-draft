"""Trainer assignment: capacity, change and removal with alerts, and member requests."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.membership.models import Attendance, MemberProfile
from apps.notifications.models import Notification
from apps.trainers import services
from apps.trainers.models import TrainerAssignment, TrainerProfile, TrainerRequest, TrainerSession

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

        # 4. Trainer can update own profile (including full_name, phone, is_active)
        res = self.client.patch(
            "/api/trainer/profile/",
            {
                "full_name": "Mika Reyes",
                "phone": "0917-555-0199",
                "specialization": "Kettlebell & HIIT",
                "availability": "Mon-Fri 7AM-1PM",
                "is_active": False,
            },
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.t1.refresh_from_db()
        self.t1_user.refresh_from_db()
        self.assertEqual(self.t1.specialization, "Kettlebell & HIIT")
        self.assertEqual(self.t1.phone, "0917-555-0199")
        self.assertFalse(self.t1.is_active)
        self.assertEqual(self.t1_user.first_name, "Mika")
        self.assertEqual(self.t1_user.last_name, "Reyes")

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

        # 7. Trainer schedule note sends notification (all or targeted member)
        res = self.client.post("/api/trainer/schedule/note/", {"session_name": "Sunrise HIIT", "note": "Moving to Studio 2", "member_id": self.m.pk}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["recipient_count"], 1)
        self.assertTrue(Notification.objects.filter(recipient=self.m_user, kind="TRAINER", title__contains="Sunrise HIIT").exists())

        # 8. Trainer can check in a member and fetch announcements
        checkin_res = self.client.post("/api/trainer/attendance/check-in/", {"member_id": self.m.pk}, content_type="application/json")
        self.assertEqual(checkin_res.status_code, 200)
        self.assertEqual(checkin_res.json()["member_id"], self.m.pk)

        ann_res = self.client.get("/api/trainer/announcements/")
        self.assertEqual(ann_res.status_code, 200)
        self.assertIn("items", ann_res.json())
        self.assertIn("stats", ann_res.json())

        # 9. Trainer notification endpoints (list, mark read, read-all, delete, clear)
        notif_res = self.client.get("/api/trainer/notifications/")
        self.assertEqual(notif_res.status_code, 200)
        notif_payload = notif_res.json()
        self.assertGreaterEqual(notif_payload["total"], 2)
        first_id = notif_payload["items"][0]["id"]

        read_res = self.client.post(f"/api/trainer/notifications/{first_id}/read/", {}, content_type="application/json")
        self.assertEqual(read_res.status_code, 200)
        self.assertTrue(read_res.json()["read"])

        del_res = self.client.delete(f"/api/trainer/notifications/{first_id}/")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["deleted"], first_id)

        read_all_res = self.client.post("/api/trainer/notifications/read-all/", {}, content_type="application/json")
        self.assertEqual(read_all_res.status_code, 200)
        self.assertEqual(read_all_res.json()["unread"], 0)

        clear_res = self.client.post("/api/trainer/notifications/clear/", {}, content_type="application/json")
        self.assertEqual(clear_res.status_code, 200)
        self.assertEqual(clear_res.json()["unread"], 0)

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






class TrainerOnboardingTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(
            username="owner_onboard",
            email="owner_onboard@example.com",
            password="StrongPass123!",
            role="OWNER",
        )
        self.client.force_login(self.owner)

    def test_invite_mode_creates_pending_trainer_and_accept_activates(self):
        res = self.client.post(
            "/api/staff/trainers/",
            data={
                "full_name": "Marcus Tan",
                "email": "marcus.tan@example.com",
                "phone": "09175550191",
                "specialization": "Strength, HIIT",
                "availability": "Mon-Sat, 6AM-10PM",
                "max_members": 15,
                "access_mode": "invite",
            },
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["invite_status"], "INVITE_PENDING")
        self.assertEqual(data["phone"], "09175550191")
        self.assertIn("/accounts/invite/accept/", data["invite_url"])
        self.assertFalse(data["email_sent"])

        # Resend invite issues a fresh link while still pending
        resend = self.client.post(f"/api/staff/trainers/{data['id']}/resend-invite/", data={}, content_type="application/json")
        self.assertEqual(resend.status_code, 200)
        fresh_url = resend.json()["invite_url"]
        self.assertIn("/accounts/invite/accept/", fresh_url)

        # Accept the fresh invite link
        from apps.accounts.services import accept_invite
        parts = fresh_url.rstrip("/").split("/")
        invite_id, token = int(parts[-2]), parts[-1]
        user = accept_invite(raw_token=token, invite_id=invite_id, password="CoachNewPass123!")
        self.assertTrue(user.is_active)
        self.assertEqual(user.role, "TRAINER")

        # Resend is now rejected since account is active
        resend_after = self.client.post(f"/api/staff/trainers/{data['id']}/resend-invite/", data={}, content_type="application/json")
        self.assertEqual(resend_after.status_code, 400)

        # Trainer can log in
        self.client.logout()
        login_res = self.client.post(
            "/api/auth/login/",
            data={"identity": "marcus.tan@example.com", "password": "CoachNewPass123!"},
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertEqual(login_res.json()["role"], "TRAINER")
        self.assertFalse(login_res.json()["must_change_password"])

    def test_temp_password_mode_requires_change_and_clears_on_change(self):
        res = self.client.post(
            "/api/staff/trainers/",
            data={
                "full_name": "Sophia Reyes",
                "email": "sophia.reyes@example.com",
                "specialization": "Weight Loss, Functional",
                "max_members": 12,
                "access_mode": "temp_password",
            },
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["access_mode"], "temp_password")
        self.assertTrue(data["must_change_password"])
        temp_pw = data["temp_password"]
        self.assertTrue(len(temp_pw) >= 8)

        self.client.logout()
        login_res = self.client.post(
            "/api/auth/login/",
            data={"identity": "sophia.reyes@example.com", "password": temp_pw},
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertTrue(login_res.json()["must_change_password"])

        # Change password clears must_change_password
        chg_res = self.client.post(
            "/api/auth/change-password/",
            data={"current_password": temp_pw, "new_password": "SophiaBetterPass123!"},
            content_type="application/json",
        )
        self.assertEqual(chg_res.status_code, 200)
        sess_res = self.client.get("/api/auth/session/")
        self.assertEqual(sess_res.status_code, 200)
        self.assertFalse(sess_res.json()["user"]["must_change_password"])

    def test_duplicate_email_and_invalid_payload_rejected(self):
        res1 = self.client.post(
            "/api/staff/trainers/",
            data={"full_name": "Coach One", "email": "dup@example.com", "max_members": 10, "access_mode": "invite"},
            content_type="application/json",
        )
        self.assertEqual(res1.status_code, 201)

        res_dup = self.client.post(
            "/api/staff/trainers/",
            data={"full_name": "Coach Two", "email": "DUP@example.com", "max_members": 10, "access_mode": "invite"},
            content_type="application/json",
        )
        self.assertEqual(res_dup.status_code, 400)

        res_bad = self.client.post(
            "/api/staff/trainers/",
            data={"full_name": "", "email": "not-an-email", "max_members": 10, "access_mode": "invite"},
            content_type="application/json",
        )
        self.assertEqual(res_bad.status_code, 400)

    def test_trainer_status_active_on_leave_inactive_transitions(self):
        t_user = User.objects.create_user(
            username="statuscoach@example.com",
            email="statuscoach@example.com",
            password=PASSWORD,
            role="TRAINER",
            first_name="Kai",
        )
        trainer = TrainerProfile.objects.create(user=t_user, specialization="Mobility", max_members=8)
        m_user = User.objects.create_user(
            username="statusmember@example.com",
            email="statusmember@example.com",
            password=PASSWORD,
            role="MEMBER",
            first_name="Leo",
        )
        member = MemberProfile.objects.create(user=m_user, membership_status="ACTIVE")

        res = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"status": "on_leave"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "on_leave")
        self.assertTrue(body["on_leave"])
        self.assertFalse(body["is_active"])
        trainer.refresh_from_db()

        with self.assertRaises(Exception):
            services.assign_trainer(member, trainer, actor=self.owner)

        res = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"status": "inactive"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "inactive")
        self.assertFalse(body["on_leave"])
        self.assertFalse(body["is_active"])

        res = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"status": "active"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "active")
        self.assertFalse(body["on_leave"])
        self.assertTrue(body["is_active"])
        trainer.refresh_from_db()
        services.assign_trainer(member, trainer, actor=self.owner)
        self.assertEqual(services.current_assignment(member).trainer, trainer)

        bad_res = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"status": "vacation"},
            content_type="application/json",
        )
        self.assertEqual(bad_res.status_code, 400)

        legacy_off = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"is_active": False},
            content_type="application/json",
        )
        self.assertEqual(legacy_off.status_code, 200)
        self.assertEqual(legacy_off.json()["status"], "inactive")

        legacy_on = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"is_active": True},
            content_type="application/json",
        )
        self.assertEqual(legacy_on.status_code, 200)
        self.assertEqual(legacy_on.json()["status"], "active")

    def test_deactivate_trainer_account_terminates_portal_access(self):
        t_user = User.objects.create_user(
            username="deactcoach@example.com",
            email="deactcoach@example.com",
            password=PASSWORD,
            role="TRAINER",
            first_name="Nia",
        )
        trainer = TrainerProfile.objects.create(user=t_user, specialization="HIIT", max_members=10)

        deact_res = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"account_active": False, "status": "inactive", "is_active": False},
            content_type="application/json",
        )
        self.assertEqual(deact_res.status_code, 200)
        body = deact_res.json()
        self.assertFalse(body["account_active"])
        self.assertFalse(body["is_active"])
        self.assertEqual(body["status"], "inactive")
        self.assertEqual(body["invite_status"], "DEACTIVATED")
        t_user.refresh_from_db()
        self.assertFalse(t_user.is_active)

        # Deactivated trainer cannot log in or access trainer portal API
        self.client.logout()
        bad_login = self.client.post(
            "/api/auth/login/",
            data={"identity": "deactcoach@example.com", "password": PASSWORD},
            content_type="application/json",
        )
        self.assertIn(bad_login.status_code, (400, 401, 403))

        self.client.force_login(t_user)
        portal_res = self.client.get("/api/trainer/profile/")
        self.assertEqual(portal_res.status_code, 403)

        # Owner can reactivate account access cleanly
        self.client.force_login(self.owner)
        react_res = self.client.patch(
            f"/api/staff/trainers/{trainer.pk}/",
            data={"account_active": True, "status": "active", "is_active": True},
            content_type="application/json",
        )
        self.assertEqual(react_res.status_code, 200)
        rbody = react_res.json()
        self.assertTrue(rbody["account_active"])
        self.assertTrue(rbody["is_active"])
        self.assertEqual(rbody["status"], "active")
        self.assertEqual(rbody["invite_status"], "ACTIVE")

        self.client.logout()
        ok_login = self.client.post(
            "/api/auth/login/",
            data={"identity": "deactcoach@example.com", "password": PASSWORD},
            content_type="application/json",
        )
        self.assertEqual(ok_login.status_code, 200)


class TrainerPortalBackendAuditTests(TestCase):
    """Covers database-backed TrainerSession CRUD, RBAC is_active checks, and validation."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner_audit@gym.test",
            email="owner_audit@gym.test",
            password=PASSWORD,
            role="OWNER",
            first_name="Alex",
            last_name="Owner",
        )
        self.t1_user = User.objects.create_user(
            username="coach1_audit@gym.test",
            email="coach1_audit@gym.test",
            password=PASSWORD,
            role="TRAINER",
            first_name="Mika",
            last_name="Reyes",
        )
        self.t2_user = User.objects.create_user(
            username="coach2_audit@gym.test",
            email="coach2_audit@gym.test",
            password=PASSWORD,
            role="TRAINER",
            first_name="Jun",
            last_name="Cruz",
        )
        self.t1 = TrainerProfile.objects.create(user=self.t1_user, specialization="HIIT", max_members=10)
        self.t2 = TrainerProfile.objects.create(user=self.t2_user, specialization="Strength", max_members=10)
        self.m1_user = User.objects.create_user(
            username="m1_audit@gym.test",
            email="m1_audit@gym.test",
            password=PASSWORD,
            role="MEMBER",
            first_name="Ana",
            last_name="Santos",
        )
        self.m2_user = User.objects.create_user(
            username="m2_audit@gym.test",
            email="m2_audit@gym.test",
            password=PASSWORD,
            role="MEMBER",
            first_name="Ben",
            last_name="Dizon",
        )
        self.m1 = MemberProfile.objects.create(user=self.m1_user, membership_status="ACTIVE")
        self.m2 = MemberProfile.objects.create(user=self.m2_user, membership_status="ACTIVE")
        services.assign_trainer(self.m1, self.t1, actor=self.owner)

    def test_schedule_starts_empty_without_hardcoded_dummy_sessions(self):
        self.client.force_login(self.t1_user)
        res = self.client.get("/api/trainer/schedule/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["sessions"], [])

    def test_trainer_session_crud_ownership_and_dashboard_reflection(self):
        today_dow = (timezone.localdate().weekday() + 1) % 7
        self.client.force_login(self.t1_user)

        # Validation rejects blank name or invalid time
        bad = self.client.post(
            "/api/trainer/schedule/sessions/",
            {"name": "", "day_of_week": today_dow, "start_time": "25:99"},
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 400)

        # Create real session in DB
        created = self.client.post(
            "/api/trainer/schedule/sessions/",
            {
                "name": "Morning Conditioning",
                "day_of_week": today_dow,
                "start_time": "06:30",
                "duration_mins": 50,
                "capacity": 14,
                "room": "Studio 1",
                "notes": "Bring jump rope",
            },
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertTrue(body["is_mine"])
        self.assertEqual(body["coach"], "Mika Reyes")
        sid = body["id"]
        self.assertTrue(TrainerSession.objects.filter(pk=sid, trainer=self.t1).exists())

        # Dashboard returns today's real DB session
        dash = self.client.get("/api/trainer/dashboard/")
        self.assertEqual(dash.status_code, 200)
        self.assertEqual(dash.json()["stats"]["today_my_classes"], 1)
        self.assertEqual(len(dash.json()["today_sessions"]), 1)
        self.assertEqual(dash.json()["today_sessions"][0]["id"], sid)

        # Update own session
        patched = self.client.patch(
            f"/api/trainer/schedule/sessions/{sid}/",
            {"name": "Sunrise Conditioning", "room": "Main Floor"},
            content_type="application/json",
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.json()["name"], "Sunrise Conditioning")
        self.assertEqual(patched.json()["room"], "Main Floor")

        # Another trainer sees is_mine=False and cannot edit or delete
        self.client.force_login(self.t2_user)
        sched2 = self.client.get("/api/trainer/schedule/")
        self.assertEqual(sched2.status_code, 200)
        self.assertEqual(len(sched2.json()["sessions"]), 1)
        self.assertFalse(sched2.json()["sessions"][0]["is_mine"])

        self.assertEqual(
            self.client.patch(
                f"/api/trainer/schedule/sessions/{sid}/",
                {"name": "Hijacked"},
                content_type="application/json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"/api/trainer/schedule/sessions/{sid}/").status_code,
            403,
        )

        # Owning trainer deletes session cleanly
        self.client.force_login(self.t1_user)
        deleted = self.client.delete(f"/api/trainer/schedule/sessions/{sid}/")
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(TrainerSession.objects.filter(pk=sid).exists())

    def test_deactivated_trainer_and_member_blocked_on_api_and_html(self):
        # Member blocked from trainer HTML pages and API
        self.client.force_login(self.m1_user)
        self.assertEqual(self.client.get("/trainer/members").status_code, 403)
        self.assertEqual(self.client.get("/api/trainer/schedule/sessions/").status_code, 403)

        # Deactivated trainer blocked even with active session
        self.client.force_login(self.t1_user)
        self.t1_user.is_active = False
        self.t1_user.save(update_fields=["is_active"])
        self.assertIn(self.client.get("/trainer/members").status_code, (302, 403))
        self.assertEqual(self.client.get("/api/trainer/profile/").status_code, 403)
        self.assertEqual(self.client.get("/api/trainer/dashboard/").status_code, 403)
        self.assertEqual(self.client.get("/api/trainer/schedule/sessions/").status_code, 403)

    def test_schedule_note_rejects_unassigned_member_and_profile_requires_full_name(self):
        self.client.force_login(self.t1_user)
        unassigned_res = self.client.post(
            "/api/trainer/schedule/note/",
            {"session_name": "HIIT", "note": "See you", "member_id": self.m2.pk},
            content_type="application/json",
        )
        self.assertEqual(unassigned_res.status_code, 403)

        bad_name = self.client.patch(
            "/api/trainer/profile/",
            {"full_name": "Mika"},
            content_type="application/json",
        )
        self.assertEqual(bad_name.status_code, 400)

        good_name = self.client.patch(
            "/api/trainer/profile/",
            {"full_name": "Mikaela Reyes"},
            content_type="application/json",
        )
        self.assertEqual(good_name.status_code, 200)
        self.t1_user.refresh_from_db()
        self.assertEqual(self.t1_user.first_name, "Mikaela")
        self.assertEqual(self.t1_user.last_name, "Reyes")

    def test_cannot_assign_or_request_pending_on_leave_inactive_or_deactivated_trainer(self):
        pending_user = User.objects.create_user(
            username="pending_trainer@gym.test",
            email="pending_trainer@gym.test",
            password=PASSWORD,
            role="TRAINER",
            first_name="Angelo",
            last_name="Pending",
            is_active=False,
        )
        pending_t = TrainerProfile.objects.create(
            user=pending_user,
            specialization="Strength",
            max_members=20,
            is_active=True,
            status=TrainerProfile.Status.ACTIVE,
        )
        on_leave_user = User.objects.create_user(
            username="leave_trainer@gym.test",
            email="leave_trainer@gym.test",
            password=PASSWORD,
            role="TRAINER",
            first_name="Sam",
            last_name="Leave",
        )
        on_leave_t = TrainerProfile.objects.create(
            user=on_leave_user,
            specialization="Cardio",
            max_members=10,
            is_active=True,
            status=TrainerProfile.Status.ON_LEAVE,
        )
        inactive_user = User.objects.create_user(
            username="inactive_trainer@gym.test",
            email="inactive_trainer@gym.test",
            password=PASSWORD,
            role="TRAINER",
            first_name="Pat",
            last_name="Inactive",
        )
        inactive_t = TrainerProfile.objects.create(
            user=inactive_user,
            specialization="HIIT",
            max_members=10,
            is_active=False,
            status=TrainerProfile.Status.INACTIVE,
        )
        # Deactivated user whose TrainerProfile.is_active stayed True
        self.t1_user.is_active = False
        self.t1_user.save(update_fields=["is_active"])

        self.assertTrue(services.is_trainer_assignable(self.t2))
        for bad in (pending_t, on_leave_t, inactive_t, self.t1):
            self.assertFalse(services.is_trainer_assignable(bad))
            with self.assertRaises(Exception):
                services.assign_trainer(self.m2, bad, actor=self.owner)
            with self.assertRaises(Exception):
                services.request_trainer(self.m2, trainer=bad, note="Please assign")

        # Staff assign API rejects all unavailable trainers
        self.client.force_login(self.owner)
        for bad in (pending_t, on_leave_t, inactive_t, self.t1):
            res = self.client.post(
                f"/api/staff/members/{self.m2.pk}/trainer/",
                {"trainer_id": bad.pk},
                content_type="application/json",
            )
            self.assertEqual(res.status_code, 400)

        # Approving a request while overriding to an unavailable trainer also fails
        open_req = services.request_trainer(self.m2, note="Any active trainer")
        decide_res = self.client.post(
            f"/api/staff/trainer-requests/{open_req.pk}/decide/",
            {"approve": True, "trainer_id": pending_t.pk},
            content_type="application/json",
        )
        self.assertEqual(decide_res.status_code, 400)
        self.assertIsNone(services.current_assignment(self.m2))

        # Member trainer options exclude unavailable trainers and member request API rejects them
        self.client.force_login(self.m2_user)
        me_res = self.client.get("/api/trainer/me/")
        self.assertEqual(me_res.status_code, 200)
        option_ids = [item["id"] for item in me_res.json()["options"]]
        self.assertIn(self.t2.pk, option_ids)
        for bad in (pending_t, on_leave_t, inactive_t, self.t1):
            self.assertNotIn(bad.pk, option_ids)
            req_res = self.client.post(
                "/api/trainer-requests/",
                {"trainer_id": bad.pk, "note": "Can I train?"},
                content_type="application/json",
            )
            self.assertEqual(req_res.status_code, 400)
