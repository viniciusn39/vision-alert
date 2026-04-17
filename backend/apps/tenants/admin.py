from django.contrib import admin
from .models import Plan, Partner, Tenant, TenantSettings

@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("display_name", "price", "max_cameras", "max_users", "max_rules", "sort_order", "is_active")
    list_editable = ("is_active",)
    list_display_links = ("display_name",)

@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ("company_name", "email", "commission_rate", "clients_count", "is_active")
    search_fields = ("company_name", "email", "cnpj")

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("company_name", "email", "plan", "partner", "status", "trial_ends_at", "created_at")
    list_filter = ("status", "plan", "partner")
    search_fields = ("company_name", "email", "cnpj")

@admin.register(TenantSettings)
class TenantSettingsAdmin(admin.ModelAdmin):
    list_display = ("tenant", "alert_email", "updated_at")
