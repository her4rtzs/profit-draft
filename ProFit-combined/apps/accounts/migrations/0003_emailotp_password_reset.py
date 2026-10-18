from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_emailotp_staffinvite"),
    ]

    operations = [
        migrations.AlterField(
            model_name="emailotp",
            name="purpose",
            field=models.CharField(
                choices=[("SIGNUP", "Signup"), ("PASSWORD_RESET", "Password reset")],
                default="SIGNUP",
                max_length=20,
            ),
        ),
    ]
