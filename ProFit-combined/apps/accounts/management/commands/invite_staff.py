"""Owner-only staff-invite create+send path (minimal, scriptable, testable).

    python manage.py invite_staff --owner <username> --email a@b.com --role CASHIER

Refuses a non-Owner ``--owner`` and a non-staff ``--role`` (CommandError, no
invite created). On an email-delivery failure the invite row persists (usable
later) and the command exits non-zero. Never prints the raw token or body.
"""

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.urls import reverse

from apps.accounts.emails import send_invite_email
from apps.accounts.models import Role, User
from apps.accounts.services import (
    EmailDeliveryError,
    create_staff_invite,
)


class Command(BaseCommand):
    help = "Create and email an Owner-issued staff invite (Cashier/Trainer)."

    def add_arguments(self, parser):
        parser.add_argument("--owner", required=True, help="Owner username.")
        parser.add_argument("--email", required=True, help="Invitee email.")
        parser.add_argument(
            "--role",
            required=True,
            choices=[Role.CASHIER.value, Role.TRAINER.value],
            help="Staff role to assign (CASHIER or TRAINER).",
        )

    def handle(self, *args, **options):
        owner = User.objects.filter(username=options["owner"]).first()
        if owner is None:
            raise CommandError("Owner user not found.")

        try:
            invite, raw_token = create_staff_invite(
                owner=owner,
                email=options["email"],
                role=options["role"],
            )
        except PermissionDenied:
            raise CommandError("The given user is not an Owner.")
        except ValidationError as exc:
            raise CommandError(str(exc))

        accept_url = settings.SITE_BASE_URL.rstrip("/") + reverse(
            "accounts:accept_invite", args=[invite.id, raw_token]
        )
        try:
            send_invite_email(invite, raw_token, accept_url)
        except EmailDeliveryError:
            raise CommandError(
                "Invite created but the email could not be sent; retry delivery later."
            )

        self.stdout.write(
            self.style.SUCCESS(f"Invite #{invite.id} created for role {invite.role}.")
        )
