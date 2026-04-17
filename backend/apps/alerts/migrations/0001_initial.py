from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [("tenants","0001_initial"),("cameras","0001_initial")]
    operations = [
        migrations.CreateModel(name="AlertRule", fields=[
            ("id",               models.BigAutoField(auto_created=True, primary_key=True)),
            ("tenant",           models.ForeignKey("tenants.Tenant", on_delete=django.db.models.deletion.CASCADE, related_name="alert_rules")),
            ("name",             models.CharField(max_length=120)),
            ("behavior",         models.CharField(max_length=30)),
            ("cameras",          models.ManyToManyField("cameras.Camera", blank=True)),
            ("severity",         models.CharField(max_length=10, default="medium")),
            ("is_active",        models.BooleanField(default=True)),
            ("params",           models.JSONField(default=dict, blank=True)),
            ("channels",         models.JSONField(default=list)),
            ("webhook_url",      models.URLField(blank=True)),
            ("cooldown_seconds", models.PositiveIntegerField(default=60)),
            ("created_at",       models.DateTimeField(auto_now_add=True)),
            ("updated_at",       models.DateTimeField(auto_now=True)),
        ]),
        migrations.CreateModel(name="Alert", fields=[
            ("id",             models.BigAutoField(auto_created=True, primary_key=True)),
            ("rule",           models.ForeignKey("alerts.AlertRule", on_delete=django.db.models.deletion.CASCADE, related_name="alerts")),
            ("camera",         models.ForeignKey("cameras.Camera",   on_delete=django.db.models.deletion.CASCADE, related_name="alerts")),
            ("status",         models.CharField(max_length=15, default="open")),
            ("description",    models.TextField(blank=True)),
            ("snapshot",       models.ImageField(upload_to="alert_snapshots/", null=True, blank=True)),
            ("detection_data", models.JSONField(default=dict, blank=True)),
            ("triggered_at",   models.DateTimeField(auto_now_add=True)),
            ("resolved_at",    models.DateTimeField(null=True, blank=True)),
            ("notified",       models.BooleanField(default=False)),
        ], options={"ordering":["-triggered_at"]}),
    ]
