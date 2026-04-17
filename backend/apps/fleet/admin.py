from django.contrib import admin
from .models import EdgeDevice, DeviceLog

@admin.register(EdgeDevice)
class EdgeDeviceAdmin(admin.ModelAdmin):
    list_display = ["name", "tenant", "status", "software_version", "last_heartbeat"]
    list_filter = ["status", "tenant"]
    readonly_fields = ["id", "api_key_hash", "api_key_prefix", "last_heartbeat", "last_sync", "created_at"]

@admin.register(DeviceLog)
class DeviceLogAdmin(admin.ModelAdmin):
    list_display = ["device", "level", "message", "created_at"]
    list_filter = ["level", "device"]
