from django.contrib import admin
from .models import Camera, CameraZone

@admin.register(Camera)
class CameraAdmin(admin.ModelAdmin):
    list_display  = ("name","tenant","location","protocol","status","is_active","last_seen")
    list_filter   = ("status","protocol","tenant")
    search_fields = ("name","tenant__company_name","location")

@admin.register(CameraZone)
class CameraZoneAdmin(admin.ModelAdmin):
    list_display = ("name","camera","is_restricted")
