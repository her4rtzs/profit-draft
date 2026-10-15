"""Staff-invite tests (design tests 14-18, 24-25, plus review NIT 1 & 2)."""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Role, StaffInvite
from apps.accounts.services import (
    EmailDeliveryError,
    InvalidInviteError,
    accept_invite,
    create_staff_invite,
)

User = get_user_model()

PASSWORD = "sup3r-secret-pw!"


class InviteServiceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", password=PASSWORD, role=Role.OWNER
        )
        self.cashier = User.objects.create_user(
            username="cashier", password=PASSWORD, role=Role.CASHIER
        )

    def test_only_owner_can_create_invite(self):
        with self.assertRaises(PermissionDenied):
            create_staff_invite(
                owner=self.cashier, email="new@example.com", role=Role.CASHIER
            )

    def test_create_invite_rejects_non_staff_role(self):
        with self.assertRaises(ValidationError):
            create_staff_invite(
                owner=self.owner, email="new@example.com", role=Role.OWNER
            )

    def test_accept_sets_password_and_activates_with_owner_role(self):
        invite, raw = create_staff_invite(
            owner=self.owner, email="New@Example.com", role=Role.TRAINER
        )
        user = accept_invite(raw_token=raw, invite_id=invite.id, password=PASSWORD)
        self.assertTrue(user.is_active)
        self.assertEqual(user.role, Role.TRAINER)
        # Email/username come from the invite, normalized.
        self.assertEqual(user.username, "new@example.com")
        self.assertEqual(user.email, "new@example.com")
        self.assertTrue(user.check_password(PASSWORD))
        invite.refresh_from_db()
        self.assertIsNotNone(invite.used_at)
        self.assertEqual(invite.accepted_user_id, user.id)

    def test_expired_token_rejected(self):
        invite, raw = create_staff_invite(
            owner=self.owner, email="new@example.com", role=Role.CASHIER
        )
        invite.expires_at = timezone.now() - timedelta(seconds=1)
        invite.save(update_fields=["expires_at"])
        with self.assertRaises(InvalidInviteError):
            accept_invite(raw_token=raw, invite_id=invite.id, password=PASSWORD)

    def test_used_token_rejected(self):
        invite, raw = create_staff_invite(
            owner=self.owner, email="new@example.com", role=Role.CASHIER
        )
        accept_invite(raw_token=raw, invite_id=invite.id, password=PASSWORD)
        with self.assertRaises(InvalidInviteError):
            accept_invite(raw_token=raw, invite_id=invite.id, password=PASSWORD)

    def test_garbage_token_rejected(self):
        invite, _raw = create_staff_invite(
            owner=self.owner, email="new@example.com", role=Role.CASHIER
        )
        with self.assertRaises(InvalidInviteError):
            accept_invite(
                raw_token="not-the-token", invite_id=invite.id, password=PASSWORD
            )

    def test_accept_into_existing_username_refused(self):
        User.objects.create_user(
            username="dupe@example.com",
            email="dupe@example.com",
            password=PASSWORD,
        )
        invite, raw = create_staff_invite(
            owner=self.owner, email="dupe@example.com", role=Role.CASHIER
        )
        with self.assertRaises(InvalidInviteError):
            accept_invite(raw_token=raw, invite_id=invite.id, password=PASSWORD)

    def test_model_clean_rejects_owner_role(self):
        invite = StaffInvite(
            email="x@example.com",
            role=Role.OWNER,
            token_hash="x",
            invited_by=self.owner,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with self.assertRaises(ValidationError):
            invite.full_clean()


class InviteCommandTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", password=PASSWORD, role=Role.OWNER
        )
        self.cashier = User.objects.create_user(
            username="cashier", password=PASSWORD, role=Role.CASHIER
        )

    def test_command_success_creates_invite_and_sends_mail(self):
        out = StringIO()
        call_command(
            "invite_staff",
            "--owner",
            "owner",
            "--email",
            "new@example.com",
            "--role",
            "CASHIER",
            stdout=out,
        )
        self.assertEqual(StaffInvite.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_command_rejects_non_owner(self):
        with self.assertRaises(CommandError):
            call_command(
                "invite_staff",
                "--owner",
                "cashier",
                "--email",
                "new@example.com",
                "--role",
                "CASHIER",
            )
        self.assertEqual(StaffInvite.objects.count(), 0)

    def test_command_rejects_invalid_role(self):
        with self.assertRaises(CommandError):
            call_command(
                "invite_staff",
                "--owner",
                "owner",
                "--email",
                "new@example.com",
                "--role",
                "OWNER",
            )
        self.assertEqual(StaffInvite.objects.count(), 0)

    def test_command_delivery_failure_persists_invite(self):
        with mock.patch(
            "apps.accounts.management.commands.invite_staff.send_invite_email",
            side_effect=EmailDeliveryError("down"),
        ):
            with self.assertRaises(CommandError):
                call_command(
                    "invite_staff",
                    "--owner",
                    "owner",
                    "--email",
                    "new@example.com",
                    "--role",
                    "TRAINER",
                )
        # The invite row persists so delivery can be retried.
        self.assertEqual(StaffInvite.objects.count(), 1)
