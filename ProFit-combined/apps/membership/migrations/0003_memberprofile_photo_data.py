from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("membership", "0002_memberprofile_phone_address"),
    ]

    operations = [
        migrations.AddField(
            model_name="memberprofile",
            name="photo_data",
            field=models.TextField(blank=True, default=""),
        ),
    ]
