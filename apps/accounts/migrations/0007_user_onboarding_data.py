# Generated manually for User.onboarding_data

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_user_avatar_data"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="onboarding_data",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
