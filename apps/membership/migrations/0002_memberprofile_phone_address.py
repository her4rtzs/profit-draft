from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("membership", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="memberprofile",
            name="phone",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="memberprofile",
            name="address",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
