# Generated manually for MemberProfile.onboarding_data

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("membership", "0005_memberprofile_trial_ends_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="memberprofile",
            name="onboarding_data",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
