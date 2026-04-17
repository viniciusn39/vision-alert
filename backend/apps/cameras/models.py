from django.db import models


class TenantQuerysetMixin:
    """Mixin for ViewSets — auto-filters queryset by request.tenant."""
    def get_queryset(self):
        qs = super().get_queryset()
        if hasattr(self.request, "tenant") and self.request.tenant:
            return qs.filter(tenant=self.request.tenant)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class Camera(models.Model):
    PROTOCOL_CHOICES = [
        ("rtsp",  "RTSP"),
        ("http",  "HTTP/MJPEG"),
        ("local", "Webcam Local"),
        ("file",  "Arquivo de Vídeo"),
        ("youtube", "YouTube"),
    ]
    STATUS_CHOICES = [
        ("online",  "Online"),
        ("offline", "Offline"),
        ("error",   "Erro"),
        ("alert",   "Alerta"),
    ]

    tenant    = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="cameras")
    name      = models.CharField("Nome", max_length=120)
    location  = models.CharField("Localização", max_length=120, blank=True)
    url       = models.CharField("URL / Endereço", max_length=500)
    protocol  = models.CharField("Protocolo", max_length=10, choices=PROTOCOL_CHOICES, default="rtsp")
    username  = models.CharField("Usuário", max_length=100, blank=True)
    password  = models.CharField("Senha", max_length=500, blank=True)
    is_active = models.BooleanField("Ativa", default=True)
    status    = models.CharField("Status", max_length=10, choices=STATUS_CHOICES, default="offline")
    last_seen = models.DateTimeField("Último contato", null=True, blank=True)
    snapshot  = models.ImageField("Snapshot", upload_to="snapshots/", null=True, blank=True)
    entry_line_y = models.FloatField("Linha de entrada (0-1)", null=True, blank=True, help_text="Posição vertical da linha de contagem (0=topo, 1=base)")
    location_obj = models.ForeignKey("locations.Location", on_delete=models.SET_NULL, null=True, blank=True, related_name="cameras")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Câmera"
        verbose_name_plural = "Câmeras"
        ordering = ["name"]
        unique_together = [["tenant", "name"]]

    def __str__(self):
        return f"{self.tenant} — {self.name}"

    def save(self, *args, **kwargs):
        # Encrypt password before saving if it's not already encrypted
        if self.password and not self.password.startswith("gAAAAA"):
            from .crypto import encrypt_value
            self.password = encrypt_value(self.password)
        super().save(*args, **kwargs)

    def get_decrypted_password(self):
        if not self.password:
            return ""
        from .crypto import decrypt_value
        return decrypt_value(self.password)

    def get_stream_url(self):
        if self.protocol == "local":
            return int(self.url) if self.url.isdigit() else 0
        if self.protocol in ("file", "youtube"):
            return self.url
        if self.username and self.password:
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(self.url)
            decrypted_pwd = self.get_decrypted_password()
            netloc = f"{self.username}:{decrypted_pwd}@{parsed.hostname}"
            if parsed.port:
                netloc += f":{parsed.port}"
            return urlunparse(parsed._replace(netloc=netloc))
        return self.url


class CameraZone(models.Model):
    camera        = models.ForeignKey(Camera, on_delete=models.CASCADE, related_name="zones")
    name          = models.CharField("Nome da zona", max_length=100)
    points        = models.JSONField("Pontos", default=list)
    is_restricted = models.BooleanField("Zona restrita", default=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Zona"

    def __str__(self):
        return f"{self.camera.name} — {self.name}"


class CameraMetric(models.Model):
    """Série temporal de métricas por câmera"""
    METRIC_TYPES = [
        ("people_count",   "Contagem de pessoas"),
        ("queue_size",     "Tamanho da fila"),
        ("vehicle_count",  "Contagem de veículos"),
        ("alert_count",    "Alertas disparados"),
        ("motion_score",   "Nível de movimento"),
    ]
    camera      = models.ForeignKey(Camera, on_delete=models.CASCADE, related_name="metrics")
    metric_type = models.CharField(max_length=30, choices=METRIC_TYPES)
    value       = models.FloatField()
    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes  = [models.Index(fields=["camera", "metric_type", "timestamp"])]

    def __str__(self):
        return f"{self.camera} | {self.metric_type} = {self.value}"
