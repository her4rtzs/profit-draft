import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("membership", "0002_memberprofile_phone_address"),
    ]

    operations = [
        migrations.CreateModel(
            name="TrainerProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("specialization", models.CharField(blank=True, default="", max_length=120)),
                ("bio", models.TextField(blank=True, default="")),
                ("availability", models.CharField(blank=True, default="", max_length=160)),
                ("max_members", models.PositiveSmallIntegerField(default=20)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.OneToOneField(limit_choices_to={"role": "TRAINER"}, on_delete=django.db.models.deletion.CASCADE, related_name="trainer_profile", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["user__first_name", "user__username"]},
        ),
        migrations.CreateModel(
            name="TrainerAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("assigned_at", models.DateTimeField(auto_now_add=True)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("assigned_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="trainer_assignments", to="membership.memberprofile")),
                ("trainer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="assignments", to="trainers.trainerprofile")),
            ],
            options={"ordering": ["-assigned_at", "-id"]},
        ),
        migrations.CreateModel(
            name="TrainerRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("note", models.TextField(blank=True, default="")),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("APPROVED", "Approved"), ("DECLINED", "Declined"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                ("decided_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="trainer_requests", to="membership.memberprofile")),
                ("trainer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="requests", to="trainers.trainerprofile")),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.AddIndex(
            model_name="trainerassignment",
            index=models.Index(fields=["member", "ended_at"], name="trainer_assign_member_idx"),
        ),
    ]
