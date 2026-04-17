from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [("tenants","0001_initial")]
    operations = [
        migrations.CreateModel(name="Subscription", fields=[
            ("id",                    models.BigAutoField(auto_created=True, primary_key=True)),
            ("tenant",                models.ForeignKey("tenants.Tenant", on_delete=django.db.models.deletion.CASCADE, related_name="subscriptions")),
            ("plan",                  models.ForeignKey("tenants.Plan",   on_delete=django.db.models.deletion.PROTECT)),
            ("status",                models.CharField(max_length=15, default="active")),
            ("current_period_start",  models.DateField(null=True, blank=True)),
            ("current_period_end",    models.DateField(null=True, blank=True)),
            ("next_billing_date",     models.DateField(null=True, blank=True)),
            ("asaas_subscription_id", models.CharField(max_length=50, blank=True)),
            ("created_at",            models.DateTimeField(auto_now_add=True)),
            ("updated_at",            models.DateTimeField(auto_now=True)),
        ]),
        migrations.CreateModel(name="Invoice", fields=[
            ("id",                models.BigAutoField(auto_created=True, primary_key=True)),
            ("tenant",            models.ForeignKey("tenants.Tenant", on_delete=django.db.models.deletion.CASCADE, related_name="invoices")),
            ("subscription",      models.ForeignKey("billing.Subscription", on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True)),
            ("amount",            models.DecimalField(max_digits=8, decimal_places=2)),
            ("due_date",          models.DateField()),
            ("status",            models.CharField(max_length=15, default="pending")),
            ("payment_method",    models.CharField(max_length=15, default="boleto")),
            ("asaas_payment_id",  models.CharField(max_length=50, blank=True)),
            ("boleto_url",        models.URLField(blank=True)),
            ("boleto_barcode",    models.CharField(max_length=100, blank=True)),
            ("pix_qrcode",        models.TextField(blank=True)),
            ("pix_copy_paste",    models.CharField(max_length=300, blank=True)),
            ("invoice_url",       models.URLField(blank=True)),
            ("paid_at",           models.DateTimeField(null=True, blank=True)),
            ("description",       models.CharField(max_length=200, blank=True)),
            ("created_at",        models.DateTimeField(auto_now_add=True)),
            ("updated_at",        models.DateTimeField(auto_now=True)),
        ], options={"ordering":["-due_date"]}),
    ]
