import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Announcement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=160)),
                ("message", models.TextField()),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("PUBLISHED", "Published"), ("ARCHIVED", "Archived")], default="DRAFT", max_length=20)),
                ("audience", models.CharField(choices=[("ALL", "All members"), ("SELECTED", "Selected members")], default="ALL", max_length=20)),
                ("publish_on", models.DateField(blank=True, null=True)),
                ("pinned", models.BooleanField(default=False)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("recipients", models.ManyToManyField(blank=True, related_name="targeted_announcements", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-pinned", "-publish_on", "-id"]},
        ),
        migrations.AddIndex(
            model_name="announcement",
            index=models.Index(fields=["status"], name="announce_status_idx"),
        ),
    ]
