from django.db import models
import uuid


class EdgeDevice(models.Model):
    """Represents a physical mini PC deployed at a client site."""
    STATUS_CHOICES = [
        ("online", "Online"),
        ("offline", "Offline"),
        ("updating", "Atualizando"),
        ("error", "Erro"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="devices")
    name = models.CharField("Nome", max_length=120, help_text="Ex: Mini PC Loja Centro")
    api_key = models.CharField("API Key", max_length=64, unique=True)
    status = models.CharField("Status", max_length=15, choices=STATUS_CHOICES, default="offline")

    # Hardware info (reported by agent)
    gpu_model = models.CharField("GPU", max_length=100, blank=True)
    cpu_model = models.CharField("CPU", max_length=100, blank=True)
    ram_total_gb = models.FloatField("RAM (GB)", null=True, blank=True)
    disk_total_gb = models.FloatField("Disco (GB)", null=True, blank=True)
    software_version = models.CharField("Versao software", max_length=30, blank=True)

    # Health metrics (updated by heartbeat)
    cpu_percent = models.FloatField(null=True, blank=True)
    gpu_percent = models.FloatField(null=True, blank=True)
    ram_percent = models.FloatField(null=True, blank=True)
    disk_percent = models.FloatField(null=True, blank=True)
    cameras_active = models.IntegerField(default=0)
    cameras_total = models.IntegerField(default=0)
    uptime_seconds = models.IntegerField(default=0)

    last_heartbeat = models.DateTimeField("Ultimo heartbeat", null=True, blank=True)
    last_sync = models.DateTimeField("Ultimo sync", null=True, blank=True)
    ip_address = models.GenericIPAddressField("IP publico", null=True, blank=True)
    local_ip = models.GenericIPAddressField("IP local", null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Dispositivo Edge"
        verbose_name_plural = "Dispositivos Edge"
        ordering = ["-last_heartbeat"]

    def __str__(self):
        return f"{self.tenant} — {self.name}"

    @property
    def is_online(self):
        if not self.last_heartbeat:
            return False
        from django.utils import timezone
        from datetime import timedelta
        return timezone.now() - self.last_heartbeat < timedelta(minutes=5)

    @classmethod
    def generate_api_key(cls):
        import secrets
        return secrets.token_hex(32)


class DeviceLog(models.Model):
    """Log entries from edge devices."""
    LEVEL_CHOICES = [
        ("info", "Info"),
        ("warning", "Warning"),
        ("error", "Error"),
        ("critical", "Critical"),
    ]

    device = models.ForeignKey(EdgeDevice, on_delete=models.CASCADE, related_name="logs")
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default="info")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["device", "-created_at"])]
