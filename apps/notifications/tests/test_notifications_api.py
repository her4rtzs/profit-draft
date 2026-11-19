"""Notifications: database-backed list, unread count, mark read, and renewal alerts."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.finance.services import record_desk_payment
from apps.membership.models import MemberProfile
from apps.notifications.models import Notification
from apps.notifications.services import notify, notify_many, unread_count

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

    def test_delete_and_clear_notifications(self):
        n1 = notify(self.member, "Alert 1", kind="TRAINER")
        notify(self.member, "Alert 2", kind="ANNOUNCEMENT")
        self.as_(self.member)

        # Delete one
        del_res = self.api.delete(f"/api/notifications/{n1.pk}/")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["unread"], 1)

        # Cannot delete someone else's notification
        other_note = notify(self.other, "Private")
        self.assertEqual(self.api.delete(f"/api/notifications/{other_note.pk}/").status_code, 404)

        # Clear remaining
        clear_res = self.api.post("/api/notifications/clear/", {}, format="json")
        self.assertEqual(clear_res.status_code, 200)
        self.assertEqual(clear_res.json()["unread"], 0)
        self.assertEqual(Notification.objects.filter(recipient=self.member).count(), 0)

    @override_settings(
        SITE_BASE_URL="https://www.functionalfitnessgym.site",
        DEFAULT_FROM_EMAIL="ProFit <noreply@functionalfitnessgym.site>",
    )
    def test_notify_and_notify_many_send_email_to_active_recipients(self):
        mail.outbox.clear()
        notify(
            self.member,
            "Gym update",
            kind=Notification.Kind.GENERAL,
            body="New equipment has arrived.",
            link="member-home.html#announcements",
        )
        notify_many(
            [self.member, self.other],
            "Schedule notice",
            kind=Notification.Kind.ANNOUNCEMENT,
            body="Weekend hours start at 6 AM.",
            link="/member-home.html",
        )
        self.assertEqual(len(mail.outbox), 3)
        first = mail.outbox[0]
        self.assertEqual(first.from_email, "ProFit <noreply@functionalfitnessgym.site>")
        self.assertEqual(first.to, ["m@gym.test"])
        self.assertIn("Gym update", first.subject)
        self.assertIn("New equipment has arrived.", first.body)
        self.assertIn("https://www.functionalfitnessgym.site/member-home.html#announcements", first.body)
        self.assertEqual(mail.outbox[1].to, ["m@gym.test"])
        self.assertEqual(mail.outbox[2].to, ["o@gym.test"])

    def test_email_delivery_error_does_not_break_in_app_notification(self):
        with mock.patch("apps.notifications.services.send_mail", side_effect=RuntimeError("smtp down")):
            note = notify(self.member, "Still saved", body="DB write survives email failure.")
        self.assertIsNotNone(note)
        self.assertTrue(Notification.objects.filter(pk=note.pk).exists())

