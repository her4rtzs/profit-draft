"""Notifications: database-backed list, unread count, mark read, and renewal alerts."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.finance.services import record_desk_payment
from apps.membership.models import MemberProfile
from apps.notifications.models import Notification
from apps.notifications.services import notify, unread_count

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"
LIST = "/api/notifications/"
READ_ALL = "/api/notifications/read-all/"


class NotificationApiTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.member = User.objects.create_user(username="m@gym.test", email="m@gym.test", password=PASSWORD, role="MEMBER")
        self.other = User.objects.create_user(username="o@gym.test", email="o@gym.test", password=PASSWORD, role="MEMBER")
        self.owner = User.objects.create_user(username="owner@gym.test", email="owner@gym.test", password=PASSWORD, role="OWNER")

    def as_(self, user):
        self.api.force_authenticate(user=user)

    def test_list_returns_newest_first_with_unread_count(self):
        notify(self.member, "First", kind="ANNOUNCEMENT", link="member-home.html")
        notify(self.member, "Second")
        self.as_(self.member)
        body = self.api.get(LIST).json()
        self.assertEqual(body["unread"], 2)
        self.assertEqual([i["title"] for i in body["items"]], ["Second", "First"])
        self.assertFalse(body["items"][0]["read"])
        self.assertEqual(body["items"][1]["link"], "member-home.html")

    def test_mark_one_read_updates_the_unread_count(self):
        note = notify(self.member, "Hello")
        self.as_(self.member)
        res = self.api.post(f"/api/notifications/{note.pk}/read/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["unread"], 0)
        note.refresh_from_db()
        self.assertIsNotNone(note.read_at)

    def test_mark_all_read(self):
        notify(self.member, "A")
        notify(self.member, "B")
        self.as_(self.member)
        self.assertEqual(self.api.post(READ_ALL, {}, format="json").json()["unread"], 0)
        self.assertEqual(unread_count(self.member), 0)

    def test_cannot_mark_someone_elses_notification(self):
        note = notify(self.other, "Private")
        self.as_(self.member)
        res = self.api.post(f"/api/notifications/{note.pk}/read/", {}, format="json")
        self.assertEqual(res.status_code, 404)
        note.refresh_from_db()
        self.assertIsNone(note.read_at)

    def test_anonymous_is_refused(self):
        self.assertIn(self.api.get(LIST).status_code, (401, 403))

    def test_renewal_notifies_the_member(self):
        profile = MemberProfile.objects.create(user=self.member, membership_status="PENDING")
        record_desk_payment(member=profile, plan="monthly", method="CASH", recorded_by=self.owner)
        notes = Notification.objects.filter(recipient=self.member, kind="MEMBERSHIP")
        self.assertEqual(notes.count(), 1)
        self.assertIn("monthly", notes.first().body)
