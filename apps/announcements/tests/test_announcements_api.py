"""Announcements: drafts, publishing, audiences, archiving, deleting, stats, validation, and permissions."""

import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.membership.models import MemberProfile
from apps.notifications.models import Notification
from apps.trainers.models import TrainerProfile

User = get_user_model()
PASSWORD = "Sup3r-secret-pass"
STAFF = "/api/staff/announcements/"
MEMBER = "/api/announcements/"


class AnnouncementTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.owner = User.objects.create_user(
            username="owner@gym.test", email="owner@gym.test", password=PASSWORD, role="OWNER"
        )
        self.cashier = User.objects.create_user(
            username="cash@gym.test", email="cash@gym.test", password=PASSWORD, role="CASHIER"
        )
        self.trainer = User.objects.create_user(
            username="coach@gym.test", email="coach@gym.test", password=PASSWORD, role="TRAINER"
        )
        self.trainer_prof = TrainerProfile.objects.create(user=self.trainer)
        self.user_a = User.objects.create_user(
            username="a@gym.test", email="a@gym.test", password=PASSWORD, role="MEMBER"
        )
        self.user_b = User.objects.create_user(
            username="b@gym.test", email="b@gym.test", password=PASSWORD, role="MEMBER"
        )
        self.prof_a = MemberProfile.objects.create(user=self.user_a, membership_status="ACTIVE")
        self.prof_b = MemberProfile.objects.create(user=self.user_b, membership_status="ACTIVE")

    def as_(self, user):
        self.api.force_authenticate(user=user)

    def create(self, **body):
        data = {"title": "Closed Monday", "body": "The gym is closed on Monday.", "audience": "everyone"}
        data.update(body)
        self.as_(self.owner)
        res = self.api.post(STAFF, data, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def publish(self, note_id):
        self.as_(self.owner)
        return self.api.post(f"{STAFF}{note_id}/publish/", {}, format="json")

    def test_draft_is_hidden_from_members_and_trainers(self):
        self.create()
        self.as_(self.user_a)
        self.assertEqual(self.api.get(MEMBER).json(), [])
        self.as_(self.trainer)
        self.assertEqual(self.api.get(MEMBER).json(), [])

    def test_publish_to_everyone_shows_it_and_alerts_active_members_and_trainers(self):
        note = self.create(audience="everyone")
        res = self.publish(note["id"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "published")
        self.assertIsNotNone(res.json()["published_at"])

        self.as_(self.user_a)
        self.assertEqual(len(self.api.get(MEMBER).json()), 1)
        self.as_(self.trainer)
        self.assertEqual(len(self.api.get(MEMBER).json()), 1)

        self.assertEqual(Notification.objects.filter(recipient=self.user_a, kind="ANNOUNCEMENT").count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.user_b, kind="ANNOUNCEMENT").count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.trainer, kind="ANNOUNCEMENT").count(), 1)

    def test_audience_filtering_for_members_only_and_trainers_only(self):
        mem_note = self.create(title="Members Notice", audience="members", status="published")
        tr_note = self.create(title="Trainers Notice", audience="trainers", status="published")
        self.assertEqual(mem_note["status"], "published")
        self.assertEqual(tr_note["status"], "published")

        self.as_(self.user_a)
        member_titles = [n["title"] for n in self.api.get(MEMBER).json()]
        self.assertEqual(member_titles, ["Members Notice"])

        self.as_(self.trainer)
        trainer_titles = [n["title"] for n in self.api.get(MEMBER).json()]
        self.assertEqual(trainer_titles, ["Trainers Notice"])

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

    def test_archive_hides_it_from_members_and_trainers(self):
        note = self.create(status="published")
        self.as_(self.owner)
        res = self.api.patch(f"{STAFF}{note['id']}/", {"status": "archived"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "archived")

        self.as_(self.user_a)
        self.assertEqual(self.api.get(MEMBER).json(), [])
        self.as_(self.trainer)
        self.assertEqual(self.api.get(MEMBER).json(), [])

    def test_edit_and_delete_announcement(self):
        note = self.create(title="Initial Title", body="Initial body", event_date="2026-11-15")
        self.assertEqual(note["event_date"], "2026-11-15")

        self.as_(self.owner)
        patched = self.api.patch(
            f"{STAFF}{note['id']}/",
            {"title": "Updated Title", "body": "Updated body", "audience": "trainers"},
            format="json",
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.json()["title"], "Updated Title")
        self.assertEqual(patched.json()["body"], "Updated body")
        self.assertEqual(patched.json()["audience"], "trainers")

        del_res = self.api.delete(f"{STAFF}{note['id']}/")
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(del_res.json()["counts"]["all"], 0)
        self.assertEqual(self.api.get(f"{STAFF}{note['id']}/").status_code, 404)

    def test_validation_empty_title_and_length_limits(self):
        self.as_(self.owner)
        empty_res = self.api.post(STAFF, {"title": "   ", "body": "Valid"}, format="json")
        self.assertEqual(empty_res.status_code, 400)
        self.assertEqual(empty_res.json()["title"], ["Please add a title."])

        long_title_res = self.api.post(STAFF, {"title": "x" * 81, "body": "Valid"}, format="json")
        self.assertEqual(long_title_res.status_code, 400)
        self.assertIn("title", long_title_res.json())

        long_body_res = self.api.post(STAFF, {"title": "Valid", "body": "y" * 601}, format="json")
        self.assertEqual(long_body_res.status_code, 400)
        self.assertIn("body", long_body_res.json())

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
        note = self.create()
        for user in (self.cashier, self.trainer, self.user_a):
            self.as_(user)
            self.assertEqual(self.api.get(STAFF).status_code, 403)
            self.assertEqual(
                self.api.post(STAFF, {"title": "x", "body": "y", "audience": "everyone"}, format="json").status_code,
                403,
            )
            self.assertEqual(
                self.api.patch(f"{STAFF}{note['id']}/", {"title": "hacked"}, format="json").status_code,
                403,
            )
            self.assertEqual(self.api.delete(f"{STAFF}{note['id']}/").status_code, 403)

    def test_status_filter_search_stats_and_counts(self):
        self.create(title="Holiday Hours", body="Open 8am-4pm", status="published")
        self.create(title="New Kettlebells", body="Arriving next week", status="draft")
        arch = self.create(title="Old Promo", body="Summer sale", status="published")
        self.as_(self.owner)
        self.api.patch(f"{STAFF}{arch['id']}/", {"status": "archived"}, format="json")

        everything = self.api.get(STAFF).json()
        self.assertEqual(len(everything["items"]), 3)
        self.assertEqual(everything["counts"], {"all": 3, "draft": 1, "published": 1, "archived": 1})
        self.assertEqual(everything["stats"]["total"], 3)
        self.assertEqual(everything["stats"]["published_this_month"], 1)
        self.assertEqual(everything["stats"]["live_now"], 1)
        self.assertEqual(everything["stats"]["drafts"], 1)
        self.assertEqual(everything["stats"]["people_count"], 3)  # 2 members + 1 trainer

        drafts = self.api.get(STAFF, {"status": "draft"}).json()
        self.assertEqual(len(drafts["items"]), 1)
        self.assertEqual(drafts["counts"]["all"], 3)

        searched = self.api.get(STAFF, {"q": "Kettlebell"}).json()
        self.assertEqual(len(searched["items"]), 1)
        self.assertEqual(searched["items"][0]["title"], "New Kettlebells")
        self.assertEqual(searched["counts"]["all"], 3)
