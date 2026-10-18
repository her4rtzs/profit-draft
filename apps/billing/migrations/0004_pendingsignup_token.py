from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0003_pendingsignup"),
    ]

    operations = [
        migrations.AddField(
            model_name="pendingsignup",
            name="token",
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
    ]
