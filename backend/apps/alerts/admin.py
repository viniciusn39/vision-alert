from django.contrib import admin
from .models import AlertRule, Alert

@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display  = ("name","tenant","behavior","severity","is_active")
    list_filter   = ("severity","behavior","tenant")
    search_fields = ("name","tenant__company_name")

@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display  = ("rule","camera","status","triggered_at","notified")
    list_filter   = ("status","rule__severity")
    date_hierarchy = "triggered_at"
