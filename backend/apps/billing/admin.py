from django.contrib import admin
from .models import Invoice, Subscription

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display  = ("tenant","amount","due_date","status","payment_method","paid_at")
    list_filter   = ("status","payment_method")
    search_fields = ("tenant__company_name","asaas_payment_id")
    date_hierarchy = "due_date"

@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("tenant","plan","status","current_period_start","next_billing_date")
    list_filter  = ("status","plan")
