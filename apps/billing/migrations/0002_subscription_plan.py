from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="plan",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
