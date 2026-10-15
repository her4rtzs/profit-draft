"""Phase 1 staff API: member create/update/renew, and check-in rules."""

import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.membership.models import Attendance, MemberProfile

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"
MEMBERS = "/api/staff/members/"
CHECKIN = "/api/staff/attendance/check-in/"
ATTENDANCE = "/api/staff/attendance/"


class StaffApiTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = self._user("owner@gym.test", "OWNER")
        self.cashier = self._user("cash@gym.test", "CASHIER")
        self.trainer = self._user("coach@gym.test", "TRAINER")
        self.member_user = self._user("mem@gym.test", "MEMBER")
        self.member = MemberProfile.objects.create(
            user=self.member_user,
            membership_status=MemberProfile.MembershipStatus.ACTIVE,
            expiry_date=timezone.localdate() + datetime.timedelta(days=10),
        )

    def _user(self, email, role):
        return User.objects.create_user(
            username=email, email=email, password=PASSWORD, role=role
        )

    def as_(self, user):
        self.api.force_authenticate(user=user)

    # --- create / update / renew -------------------------------------------

    def test_owner_creates_member_with_plan(self):
        self.as_(self.owner)
        res = self.api.post(
            MEMBERS,
            {"name": "Ana Cruz", "email": "Ana@Example.com", "password": PASSWORD,
             "plan": "monthly", "start_date": "2026-10-01"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        user = User.objects.get(username="ana@example.com")
        self.assertEqual(user.role, "MEMBER")
        self.assertEqual(user.first_name, "Ana")
        profile = MemberProfile.objects.get(user=user)
        self.assertEqual(profile.membership_status, "ACTIVE")
        self.assertEqual(profile.expiry_date, datetime.date(2026, 10, 31))

    def test_create_without_plan_is_pending(self):
        self.as_(self.owner)
        res = self.api.post(
            MEMBERS,
            {"name": "Ben Lee", "email": "ben@example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["membership_status"], "PENDING")

    def test_duplicate_email_is_rejected(self):
        self.as_(self.owner)
        res = self.api.post(
            MEMBERS,
            {"name": "Dup", "email": "mem@gym.test", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("already exists", res.json()["detail"])

    def test_weak_password_is_rejected(self):
        self.as_(self.owner)
        res = self.api.post(
            MEMBERS,
            {"name": "Weak", "email": "weak@example.com", "password": "123"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(username="weak@example.com").exists())

    def test_cashier_can_create_but_trainer_cannot(self):
        body = {"name": "C", "email": "c1@example.com", "password": PASSWORD}
        self.as_(self.cashier)
        self.assertEqual(self.api.post(MEMBERS, body, format="json").status_code, 201)
        self.as_(self.trainer)
        body["email"] = "c2@example.com"
        self.assertEqual(self.api.post(MEMBERS, body, format="json").status_code, 403)

    def test_update_name_and_phone(self):
        self.as_(self.owner)
        res = self.api.patch(
            f"{MEMBERS}{self.member.pk}/",
            {"name": "Mem Updated", "phone": "0917 000 0000"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.member.refresh_from_db()
        self.assertEqual(self.member.phone, "0917 000 0000")
        self.assertEqual(self.member.user.first_name, "Mem")

    def test_renew_extends_from_chosen_start(self):
        self.as_(self.owner)
        res = self.api.post(
            f"{MEMBERS}{self.member.pk}/renew/",
            {"plan": "annual", "start_date": "2026-10-20"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.member.refresh_from_db()
        self.assertEqual(self.member.expiry_date, datetime.date(2027, 10, 20))

    def test_member_cannot_list_members(self):
        self.as_(self.member_user)
        self.assertEqual(self.api.get(MEMBERS).status_code, 403)

    def test_search_filters_by_name_or_email(self):
        self.as_(self.owner)
        res = self.api.get(MEMBERS, {"q": "mem@"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual([row["id"] for row in res.json()], [self.member.pk])

    # --- check-in -----------------------------------------------------------

    def test_active_member_checks_in_once_per_day(self):
        self.as_(self.owner)
        first = self.api.post(CHECKIN, {"member_id": self.member.pk}, format="json")
        second = self.api.post(CHECKIN, {"member_id": self.member.pk}, format="json")
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(Attendance.objects.filter(member=self.member).count(), 1)

    def test_expired_member_is_refused(self):
        self.member.membership_status = MemberProfile.MembershipStatus.EXPIRED
        self.member.save(update_fields=["membership_status"])
        self.as_(self.trainer)
        res = self.api.post(CHECKIN, {"member_id": self.member.pk}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("not active", res.json()["detail"])
        self.assertFalse(Attendance.objects.filter(member=self.member).exists())

    def test_unknown_member_is_404(self):
        self.as_(self.owner)
        res = self.api.post(CHECKIN, {"member_id": 999999}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_member_cannot_check_in(self):
        self.as_(self.member_user)
        res = self.api.post(CHECKIN, {"member_id": self.member.pk}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_today_attendance_list(self):
        self.as_(self.owner)
        self.api.post(CHECKIN, {"member_id": self.member.pk}, format="json")
        res = self.api.get(ATTENDANCE)
        self.assertEqual(res.status_code, 200)
        self.assertEqual([row["member_id"] for row in res.json()], [self.member.pk])

    def test_attendance_list_rejects_bad_date(self):
        self.as_(self.owner)
        self.assertEqual(self.api.get(ATTENDANCE, {"date": "10/15/2026"}).status_code, 400)
