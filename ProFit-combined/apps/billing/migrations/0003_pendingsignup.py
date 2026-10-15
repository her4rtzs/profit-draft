from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0002_subscription_plan"),
    ]

    operations = [
        migrations.CreateModel(
            name="PendingSignup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("checkout_session_id", models.CharField(db_index=True, max_length=255, unique=True)),
                ("name", models.CharField(max_length=150)),
                ("email", models.EmailField(max_length=254)),
                ("phone", models.CharField(blank=True, default="", max_length=30)),
                ("plan", models.CharField(max_length=20)),
                ("password_hash", models.CharField(max_length=256)),
                ("completed", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
