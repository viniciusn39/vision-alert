from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [("tenants","0001_initial")]
    operations = [
        migrations.CreateModel(name="Camera", fields=[
            ("id",         models.BigAutoField(auto_created=True, primary_key=True)),
            ("tenant",     models.ForeignKey("tenants.Tenant", on_delete=django.db.models.deletion.CASCADE, related_name="cameras")),
            ("name",       models.CharField(max_length=120)),
            ("location",   models.CharField(max_length=120, blank=True)),
            ("url",        models.CharField(max_length=500)),
            ("protocol",   models.CharField(max_length=10, default="rtsp")),
            ("username",   models.CharField(max_length=100, blank=True)),
            ("password",   models.CharField(max_length=100, blank=True)),
            ("is_active",  models.BooleanField(default=True)),
            ("status",     models.CharField(max_length=10, default="offline")),
            ("last_seen",  models.DateTimeField(null=True, blank=True)),
            ("snapshot",   models.ImageField(upload_to="snapshots/", null=True, blank=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)),
            ("updated_at", models.DateTimeField(auto_now=True)),
        ], options={"verbose_name":"Câmera","ordering":["name"]}),
        migrations.CreateModel(name="CameraZone", fields=[
            ("id",           models.BigAutoField(auto_created=True, primary_key=True)),
            ("camera",       models.ForeignKey("cameras.Camera", on_delete=django.db.models.deletion.CASCADE, related_name="zones")),
            ("name",         models.CharField(max_length=100)),
            ("points",       models.JSONField(default=list)),
            ("is_restricted",models.BooleanField(default=True)),
            ("created_at",   models.DateTimeField(auto_now_add=True)),
        ]),
        migrations.AlterUniqueTogether(name="camera", unique_together={("tenant","name")}),
    ]
