from django.db import migrations, models
import django.db.models.deletion, django.utils.timezone
from datetime import timedelta

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(name="Plan", fields=[
            ("id",          models.BigAutoField(auto_created=True, primary_key=True)),
            ("name",        models.CharField(max_length=20, unique=True, choices=[("free","Free"),("starter","Starter"),("pro","Pro"),("enterprise","Enterprise")])),
            ("display_name",models.CharField(max_length=50)),
            ("price",       models.DecimalField(max_digits=8, decimal_places=2, default=0)),
            ("max_cameras", models.PositiveIntegerField(default=1)),
            ("max_users",   models.PositiveIntegerField(default=2)),
            ("max_rules",   models.PositiveIntegerField(default=3)),
            ("trial_days",  models.PositiveIntegerField(default=30)),
            ("features",    models.JSONField(default=dict)),
            ("is_active",   models.BooleanField(default=True)),
            ("sort_order",  models.PositiveSmallIntegerField(default=0)),
            ("created_at",  models.DateTimeField(auto_now_add=True)),
        ], options={"verbose_name":"Plano","ordering":["sort_order","price"]}),
        migrations.CreateModel(name="Partner", fields=[
            ("id",              models.BigAutoField(auto_created=True, primary_key=True)),
            ("company_name",    models.CharField(max_length=150)),
            ("cnpj",            models.CharField(max_length=18, blank=True)),
            ("email",           models.EmailField(unique=True)),
            ("phone",           models.CharField(max_length=20, blank=True)),
            ("commission_rate", models.DecimalField(max_digits=5, decimal_places=2, default=10)),
            ("is_active",       models.BooleanField(default=True)),
            ("asaas_customer_id", models.CharField(max_length=50, blank=True)),
            ("notes",           models.TextField(blank=True)),
            ("created_at",      models.DateTimeField(auto_now_add=True)),
            ("updated_at",      models.DateTimeField(auto_now=True)),
        ], options={"verbose_name":"Revenda","ordering":["company_name"]}),
        migrations.CreateModel(name="Tenant", fields=[
            ("id",                models.BigAutoField(auto_created=True, primary_key=True)),
            ("company_name",      models.CharField(max_length=150)),
            ("cnpj",              models.CharField(max_length=18, blank=True)),
            ("phone",             models.CharField(max_length=20, blank=True)),
            ("email",             models.EmailField(unique=True)),
            ("plan",              models.ForeignKey("tenants.Plan", on_delete=django.db.models.deletion.PROTECT, related_name="tenants")),
            ("partner",           models.ForeignKey("tenants.Partner", blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="tenants")),
            ("status",            models.CharField(max_length=15, default="trial", choices=[("trial","Trial"),("active","Ativo"),("suspended","Suspenso"),("cancelled","Cancelado")])),
            ("trial_ends_at",     models.DateTimeField(null=True, blank=True)),
            ("asaas_customer_id", models.CharField(max_length=50, blank=True)),
            ("created_at",        models.DateTimeField(auto_now_add=True)),
            ("updated_at",        models.DateTimeField(auto_now=True)),
        ], options={"verbose_name":"Cliente","ordering":["company_name"]}),
        migrations.CreateModel(name="TenantSettings", fields=[
            ("id",               models.BigAutoField(auto_created=True, primary_key=True)),
            ("tenant",           models.OneToOneField("tenants.Tenant", on_delete=django.db.models.deletion.CASCADE, related_name="settings")),
            ("telegram_token",   models.CharField(max_length=200, blank=True)),
            ("telegram_chat_id", models.CharField(max_length=100, blank=True)),
            ("alert_email",      models.EmailField(blank=True)),
            ("whatsapp_number",  models.CharField(max_length=20, blank=True)),
            ("logo",             models.ImageField(upload_to="tenant_logos/", null=True, blank=True)),
            ("updated_at",       models.DateTimeField(auto_now=True)),
        ], options={"verbose_name":"Configurações do cliente"}),
    ]
