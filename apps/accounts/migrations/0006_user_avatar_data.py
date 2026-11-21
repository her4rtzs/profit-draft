# Generated manually for User.avatar_data

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_google_linked_at_user_google_sub"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="avatar_data",
            field=models.TextField(blank=True, default=""),
        ),
    ]
