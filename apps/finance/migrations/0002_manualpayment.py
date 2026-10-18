import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("membership", "0002_memberprofile_phone_address"),
        ("finance", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ManualPayment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("plan", models.CharField(choices=[("monthly", "Monthly"), ("quarterly", "Quarterly"), ("annual", "Annual")], max_length=20)),
                ("method", models.CharField(choices=[("CASH", "Cash"), ("GCASH", "GCash"), ("BANK", "Bank transfer")], max_length=20)),
                ("amount_centavos", models.PositiveIntegerField()),
                ("paid_on", models.DateField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="manual_payments", to="membership.memberprofile")),
                ("recorded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
