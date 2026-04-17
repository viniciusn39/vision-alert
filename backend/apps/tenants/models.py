from django.db import models
from django.utils import timezone
from datetime import timedelta


class Plan(models.Model):
    FREE       = "free"
    STARTER    = "starter"
    PRO        = "pro"
    ENTERPRISE = "enterprise"

    NAME_CHOICES = [
        (FREE,       "Free"),
        (STARTER,    "Starter"),
        (PRO,        "Pro"),
        (ENTERPRISE, "Enterprise"),
    ]

    name          = models.CharField("Nome", max_length=20, choices=NAME_CHOICES, unique=True)
    display_name  = models.CharField("Nome exibido", max_length=50)
    price         = models.DecimalField("Preço mensal (R$)", max_digits=8, decimal_places=2, default=0)
    max_cameras   = models.PositiveIntegerField("Máx. câmeras", default=1)
    max_users     = models.PositiveIntegerField("Máx. usuários", default=2)
    max_rules     = models.PositiveIntegerField("Máx. regras", default=3)
    trial_days    = models.PositiveIntegerField("Dias de trial", default=30)
    features      = models.JSONField("Features", default=dict)
    is_active     = models.BooleanField("Ativo", default=True)
    sort_order    = models.PositiveSmallIntegerField("Ordem", default=0)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Plano"
        verbose_name_plural = "Planos"
        ordering = ["sort_order", "price"]

    def __str__(self):
        return self.display_name

    @property
    def has_ai_vision(self):
        return self.features.get("ai_vision", False)

    @property
    def has_api_access(self):
        return self.features.get("api_access", False)


class Partner(models.Model):
    company_name    = models.CharField("Empresa", max_length=150)
    cnpj            = models.CharField("CNPJ", max_length=18, blank=True)
    email           = models.EmailField("E-mail", unique=True)
    phone           = models.CharField("Telefone", max_length=20, blank=True)
    commission_rate = models.DecimalField("Comissão (%)", max_digits=5, decimal_places=2, default=10)
    is_active       = models.BooleanField("Ativo", default=True)
    asaas_customer_id = models.CharField(max_length=50, blank=True)
    notes           = models.TextField("Observações", blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Revenda"
        verbose_name_plural = "Revendas"
        ordering = ["company_name"]

    def __str__(self):
        return self.company_name

    @property
    def clients_count(self):
        return self.tenants.filter(status__in=["trial", "active"]).count()


class Tenant(models.Model):
    TRIAL     = "trial"
    ACTIVE    = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (TRIAL,     "Trial"),
        (ACTIVE,    "Ativo"),
        (SUSPENDED, "Suspenso"),
        (CANCELLED, "Cancelado"),
    ]

    company_name      = models.CharField("Empresa", max_length=150)
    cnpj              = models.CharField("CNPJ", max_length=18, blank=True)
    phone             = models.CharField("Telefone", max_length=20, blank=True)
    email             = models.EmailField("E-mail", unique=True)
    plan              = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="tenants")
    partner           = models.ForeignKey(
        Partner, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="tenants"
    )
    status            = models.CharField("Status", max_length=15, choices=STATUS_CHOICES, default=TRIAL)
    trial_ends_at     = models.DateTimeField("Trial expira em", null=True, blank=True)
    asaas_customer_id = models.CharField("Asaas Customer ID", max_length=50, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"
        ordering = ["company_name"]

    def __str__(self):
        return self.company_name

    def save(self, *args, **kwargs):
        if not self.pk and not self.trial_ends_at:
            days = self.plan.trial_days if self.plan_id else 30
            self.trial_ends_at = timezone.now() + timedelta(days=days)
        super().save(*args, **kwargs)

    @property
    def is_active_or_trial(self):
        if self.status == self.TRIAL:
            return timezone.now() < self.trial_ends_at
        return self.status == self.ACTIVE

    @property
    def cameras_count(self):
        return self.cameras.count()

    @property
    def users_count(self):
        return self.users.count()

    @property
    def rules_count(self):
        return self.alert_rules.count()


class TenantSettings(models.Model):
    tenant            = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name="settings")
    telegram_token    = models.CharField("Token Telegram", max_length=200, blank=True)
    telegram_chat_id  = models.CharField("Chat ID Telegram", max_length=100, blank=True)
    alert_email       = models.EmailField("E-mail de alertas", blank=True)
    whatsapp_number   = models.CharField("WhatsApp", max_length=20, blank=True)
    logo              = models.ImageField("Logo", upload_to="tenant_logos/", null=True, blank=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configurações do cliente"

    def __str__(self):
        return f"Config — {self.tenant.company_name}"
