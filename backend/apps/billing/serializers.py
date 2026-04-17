from rest_framework import serializers
from .models import Invoice, Subscription

class InvoiceSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    tenant_name    = serializers.CharField(source="tenant.company_name", read_only=True)

    class Meta:
        model  = Invoice
        fields = [
            "id","tenant","tenant_name","amount","due_date","status","status_display",
            "payment_method","method_display","boleto_url","boleto_barcode",
            "pix_qrcode","pix_copy_paste","invoice_url","description","paid_at","created_at"
        ]

class SubscriptionSerializer(serializers.ModelSerializer):
    plan_name   = serializers.CharField(source="plan.display_name", read_only=True)
    plan_price  = serializers.DecimalField(source="plan.price", max_digits=8, decimal_places=2, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = Subscription
        fields = [
            "id","plan","plan_name","plan_price","status","status_display",
            "current_period_start","current_period_end","next_billing_date","created_at"
        ]
