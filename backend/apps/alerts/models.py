from django.db import models

class AlertRule(models.Model):
    BEHAVIOR_CHOICES = [
        # Básicos
        ("motion",              "Detecção de movimento"),
        ("restricted_zone",     "Pessoa em zona restrita"),
        ("loitering",           "Permanência prolongada"),
        ("crowding",            "Aglomeração"),
        ("night_movement",      "Movimento noturno"),
        ("fall_detection",      "Queda / pessoa caída"),
        ("missing_ppe",         "Ausência de EPI"),
        ("ai_vision",           "Análise por IA"),
        # Varejo / Comércio
        ("people_counter",      "Contador de pessoas"),
        ("queue_detection",     "Fila longa"),
        ("abandoned_object",    "Objeto abandonado"),
        ("shoplifting_posture",  "Postura suspeita de furto"),
        ("large_bag",           "Mochila/bolsa grande em zona"),
        # Segurança
        ("running",             "Pessoa correndo"),
        ("vehicle_pedestrian",  "Veículo em área de pedestre"),
        ("perimeter_breach",    "Invasão de perímetro"),
        ("tailgating",          "Passagem não autorizada (tailgating)"),
        # Saúde / Bem-estar
        ("lone_child",          "Criança desacompanhada"),
        ("pool_risk",           "Risco em piscina"),
        ("bathroom_loiter",     "Permanência longa em banheiro"),
        ("motionless_person",   "Pessoa imóvel (possível desmaio)"),
        # Indústria
        ("vehicle_zone",        "Veículo em zona proibida"),
        ("no_hardhat",          "Sem capacete"),
        ("animal_detection",    "Animal detectado"),
        # Veículos
        ("wrong_way",           "Veículo em sentido errado"),
        ("parking_violation",   "Veículo parado em local proibido"),
        ("overcrowded_vehicle", "Veículo com excesso de pessoas"),
        ("visitor_counter",     "Contador de visitantes (linha de cruzamento)"),
    ]
    SEVERITY_CHOICES = [
        ("critical","Crítico"), ("high","Alto"), ("medium","Médio"), ("low","Baixo")
    ]

    tenant           = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="alert_rules")
    name             = models.CharField("Nome", max_length=120)
    behavior         = models.CharField("Comportamento", max_length=30, choices=BEHAVIOR_CHOICES)
    cameras          = models.ManyToManyField("cameras.Camera", blank=True, verbose_name="Câmeras")
    severity         = models.CharField("Severidade", max_length=10, choices=SEVERITY_CHOICES, default="medium")
    is_active        = models.BooleanField("Ativa", default=True)
    params           = models.JSONField("Parâmetros", default=dict, blank=True)
    channels         = models.JSONField("Canais", default=list)
    webhook_url      = models.URLField(blank=True)
    cooldown_seconds = models.PositiveIntegerField("Cooldown (s)", default=60)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Regra de Alerta"
        ordering     = ["-severity","name"]

    def __str__(self):
        return f"{self.tenant} — {self.name}"


class Alert(models.Model):
    STATUS_CHOICES = [
        ("open","Aberto"), ("acknowledged","Reconhecido"), ("resolved","Resolvido")
    ]

    rule           = models.ForeignKey(AlertRule, on_delete=models.CASCADE, related_name="alerts")
    camera         = models.ForeignKey("cameras.Camera", on_delete=models.CASCADE, related_name="alerts")
    status         = models.CharField("Status", max_length=15, choices=STATUS_CHOICES, default="open")
    description    = models.TextField(blank=True)
    snapshot       = models.ImageField(upload_to="alert_snapshots/", null=True, blank=True)
    detection_data = models.JSONField(default=dict, blank=True)
    triggered_at   = models.DateTimeField(auto_now_add=True)
    resolved_at    = models.DateTimeField(null=True, blank=True)
    notified       = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Alerta"
        ordering     = ["-triggered_at"]

    def __str__(self):
        return f"{self.rule.name} — {self.camera.name}"

    @property
    def tenant(self):
        return self.rule.tenant
