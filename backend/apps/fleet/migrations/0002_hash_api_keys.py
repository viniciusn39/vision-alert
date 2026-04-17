import hashlib
from django.db import migrations, models


def hash_existing_keys(apps, schema_editor):
    EdgeDevice = apps.get_model("fleet", "EdgeDevice")
    for dev in EdgeDevice.objects.all():
        raw = dev.api_key
        if not raw:
            continue
        dev.api_key_hash = hashlib.sha256(raw.encode()).hexdigest()
        dev.api_key_prefix = raw[:8]
        dev.save(update_fields=["api_key_hash", "api_key_prefix"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("fleet", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="edgedevice",
            name="api_key_hash",
            field=models.CharField(max_length=64, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="edgedevice",
            name="api_key_prefix",
            field=models.CharField(max_length=12, blank=True, default=""),
            preserve_default=False,
        ),
        migrations.RunPython(hash_existing_keys, noop_reverse),
        migrations.AlterField(
            model_name="edgedevice",
            name="api_key_hash",
            field=models.CharField(max_length=64, unique=True, db_index=True),
        ),
        migrations.RemoveField(
            model_name="edgedevice",
            name="api_key",
        ),
    ]
