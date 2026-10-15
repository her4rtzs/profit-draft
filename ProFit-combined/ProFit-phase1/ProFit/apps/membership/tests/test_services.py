"""Service-layer tests: enrollment validation and attendance idempotency."""

import datetime

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.membership.models import Attendance, Enrollment, MemberProfile
from apps.membership.services import enroll_member, record_attendance

User = get_user_model()


class EnrollMemberTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="cashier", password="x")
        self.member_user = User.objects.create_user(username="m1", password="x")
        self.member = MemberProfile.objects.create(user=self.member_user)

    def test_enroll_activates_member(self):
        start = datetime.date(2025, 1, 1)
        end = datetime.date(2025, 2, 1)
        enrollment = enroll_member(self.member, start, end, created_by=self.staff)

        self.member.refresh_from_db()
        self.assertEqual(enrollment.member, self.member)
        self.assertEqual(
            self.member.membership_status, MemberProfile.MembershipStatus.ACTIVE
        )
        self.assertEqual(self.member.expiry_date, end)

    def test_enroll_rejects_end_not_after_start_without_db_write(self):
        start = datetime.date(2025, 1, 1)
        with self.assertRaises(ValidationError):
            enroll_member(self.member, start, start, created_by=self.staff)

        # No DB write on failure (atomic rollback).
        self.assertEqual(Enrollment.objects.count(), 0)
        self.member.refresh_from_db()
        self.assertEqual(
            self.member.membership_status, MemberProfile.MembershipStatus.PENDING
        )


class RecordAttendanceTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="trainer", password="x")
        self.member_user = User.objects.create_user(username="m2", password="x")
        self.member = MemberProfile.objects.create(user=self.member_user)

    def test_record_attendance_is_idempotent_same_manila_day(self):
        # Two check-ins hours apart on the same Manila day.
        base = timezone.now().replace(hour=1, minute=0, second=0, microsecond=0)
        first = record_attendance(self.member, check_in_at=base, recorded_by=self.staff)
        second = record_attendance(
            self.member,
            check_in_at=base + datetime.timedelta(hours=6),
            recorded_by=self.staff,
        )

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Attendance.objects.filter(member=self.member).count(), 1)

    def test_save_materializes_check_in_date(self):
        now = timezone.now()
        attendance = record_attendance(self.member, check_in_at=now, recorded_by=self.staff)
        self.assertEqual(attendance.check_in_date, timezone.localdate(now))
