from django.db import models
import uuid
import hashlib
import secrets


class EdgeDevice(models.Model):
    """Mini PC deployado no cliente."""
    STATUS_CHOICES = [
        ("online", "Online"),
        ("offline", "Offline"),
        ("updating", "Atualizando"),
        ("error", "Erro"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="devices")
    name = models.CharField("Nome", max_length=120)

    # Segurança: armazenamos apenas o hash da api_key. A chave em si só
    # é visível no momento do provisionamento (resposta do create).
    # Prefixo (primeiros 8 chars) fica visível no admin para identificação.
    api_key_hash = models.CharField("API Key hash", max_length=64, unique=True, db_index=True)
    api_key_prefix = models.CharField("API Key prefix", max_length=12, blank=True)

    status = models.CharField("Status", max_length=15, choices=STATUS_CHOICES, default="offline")

    # Hardware info
    gpu_model = models.CharField("GPU", max_length=100, blank=True)
    cpu_model = models.CharField("CPU", max_length=100, blank=True)
    ram_total_gb = models.FloatField("RAM (GB)", null=True, blank=True)
    disk_total_gb = models.FloatField("Disco (GB)", null=True, blank=True)
    software_version = models.CharField("Versao software", max_length=30, blank=True)

    # Health
    cpu_percent = models.FloatField(null=True, blank=True)
    gpu_percent = models.FloatField(null=True, blank=True)
    ram_percent = models.FloatField(null=True, blank=True)
    disk_percent = models.FloatField(null=True, blank=True)
    cameras_active = models.IntegerField(default=0)
    cameras_total = models.IntegerField(default=0)
    uptime_seconds = models.IntegerField(default=0)

    last_heartbeat = models.DateTimeField("Último heartbeat", null=True, blank=True)
    last_sync = models.DateTimeField("Último sync", null=True, blank=True)
    ip_address = models.GenericIPAddressField("IP público", null=True, blank=True)
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

    @staticmethod
    def hash_key(raw_key: str) -> str:
        """SHA256 da api_key — usado para lookup e armazenamento."""
        return hashlib.sha256(raw_key.encode()).hexdigest()

    @classmethod
    def create_with_key(cls, **fields):
        """
        Cria um EdgeDevice com uma nova api_key aleatória.
        Retorna (device, raw_api_key) — a raw_api_key só será mostrada agora,
        nunca mais. O banco guarda só o hash.
        """
        raw_key = secrets.token_hex(32)  # 64 chars hex
        device = cls.objects.create(
            api_key_hash=cls.hash_key(raw_key),
            api_key_prefix=raw_key[:8],
            **fields
        )
        return device, raw_key

    @classmethod
    def authenticate(cls, raw_key: str):
        """Retorna o device se a api_key for válida, None caso contrário."""
        if not raw_key:
            return None
        try:
            return cls.objects.select_related("tenant").get(
                api_key_hash=cls.hash_key(raw_key)
            )
        except cls.DoesNotExist:
            return None


class DeviceLog(models.Model):
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
