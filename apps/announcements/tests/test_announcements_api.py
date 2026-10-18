"""Announcements: drafts, publishing, audiences, archiving, the pin limit, and who may manage them."""

import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.membership.models import MemberProfile
from apps.notifications.models import Notification

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"
STAFF = "/api/staff/announcements/"
MEMBER = "/api/announcements/"


class AnnouncementTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = User.objects.create_user(username="owner@gym.test", email="owner@gym.test", password=PASSWORD, role="OWNER")
        self.cashier = User.objects.create_user(username="cash@gym.test", email="cash@gym.test", password=PASSWORD, role="CASHIER")
        self.user_a = User.objects.create_user(username="a@gym.test", email="a@gym.test", password=PASSWORD, role="MEMBER")
        self.user_b = User.objects.create_user(username="b@gym.test", email="b@gym.test", password=PASSWORD, role="MEMBER")
        self.prof_a = MemberProfile.objects.create(user=self.user_a, membership_status="ACTIVE")
        self.prof_b = MemberProfile.objects.create(user=self.user_b, membership_status="ACTIVE")

    def as_(self, user):
        self.api.force_authenticate(user=user)

    def create(self, **body):
        data = {"title": "Closed Monday", "message": "The gym is closed on Monday.", "audience": "ALL"}
        data.update(body)
        self.as_(self.owner)
        res = self.api.post(STAFF, data, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def publish(self, note_id):
        self.as_(self.owner)
        return self.api.post(f"{STAFF}{note_id}/publish/", {}, format="json")

    def test_draft_is_hidden_from_members(self):
        self.create()
        self.as_(self.user_a)
        self.assertEqual(self.api.get(MEMBER).json(), [])

    def test_publish_to_all_shows_it_and_alerts_every_active_member(self):
        note = self.create()
        self.assertEqual(self.publish(note["id"]).status_code, 200)
        self.as_(self.user_a)
        self.assertEqual(len(self.api.get(MEMBER).json()), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.user_a, kind="ANNOUNCEMENT").count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.user_b, kind="ANNOUNCEMENT").count(), 1)

    def test_selected_audience_reaches_only_the_chosen_members(self):
        note = self.create(audience="SELECTED", member_ids=[self.prof_a.pk])
        self.publish(note["id"])
        self.as_(self.user_a)
        self.assertEqual(len(self.api.get(MEMBER).json()), 1)
        self.as_(self.user_b)
        self.assertEqual(self.api.get(MEMBER).json(), [])
        self.assertEqual(Notification.objects.filter(recipient=self.user_b, kind="ANNOUNCEMENT").count(), 0)

    def test_selected_audience_needs_at_least_one_member_to_publish(self):
        note = self.create(audience="SELECTED", member_ids=[])
        self.assertEqual(self.publish(note["id"]).status_code, 400)

    def test_archive_hides_it_from_members(self):
        note = self.create()
        self.publish(note["id"])
        self.as_(self.owner)
        res = self.api.post(f"{STAFF}{note['id']}/archive/", {}, format="json")
        self.assertEqual(res.json()["status"], "ARCHIVED")
        self.as_(self.user_a)
        self.assertEqual(self.api.get(MEMBER).json(), [])

    def test_no_more_than_three_pinned_published_notices(self):
        ids = [self.create(title=f"Pin {i}", pinned=True)["id"] for i in range(4)]
        for note_id in ids[:3]:
            self.assertEqual(self.publish(note_id).status_code, 200)
        self.assertEqual(self.publish(ids[3]).status_code, 400)

    def test_future_publication_date_is_rejected(self):
        tomorrow = timezone.localdate() + datetime.timedelta(days=1)
        note = self.create(publish_on=tomorrow.isoformat())
        self.assertEqual(self.publish(note["id"]).status_code, 400)

    def test_only_the_owner_manages_announcements(self):
        self.as_(self.cashier)
        res = self.api.post(STAFF, {"title": "x", "message": "y", "audience": "ALL"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.as_(self.user_a)
        self.assertEqual(self.api.get(STAFF).status_code, 403)
        self.assertEqual(self.api.post(f"{STAFF}1/publish/", {}, format="json").status_code, 403)

    def test_status_filter_is_lenient(self):
        self.create()
        self.as_(self.owner)
        everything = self.api.get(STAFF).json()
        self.assertEqual(len(self.api.get(STAFF, {"status": "bogus"}).json()), len(everything))
        self.assertEqual(len(self.api.get(STAFF, {"status": "draft"}).json()), 1)
