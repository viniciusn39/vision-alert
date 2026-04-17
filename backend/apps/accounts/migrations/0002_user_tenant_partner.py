from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ("accounts","0001_initial"),
        ("tenants","0001_initial"),
    ]
    operations = [
        migrations.AddField(model_name="user", name="tenant",
            field=models.ForeignKey("tenants.Tenant", blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE, related_name="users")),
        migrations.AddField(model_name="user", name="partner",
            field=models.ForeignKey("tenants.Partner", blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE, related_name="users")),
    ]
