"""Trainer assignment: capacity, change and removal with alerts, and member requests."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.membership.models import MemberProfile
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
