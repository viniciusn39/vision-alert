from django.db import models


class Subscription(models.Model):
    ACTIVE     = "active"
    PAST_DUE   = "past_due"
    CANCELLED  = "cancelled"

    STATUS_CHOICES = [
        (ACTIVE,    "Ativa"),
        (PAST_DUE,  "Em atraso"),
        (CANCELLED, "Cancelada"),
    ]

    tenant                = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="subscriptions")
    plan                  = models.ForeignKey("tenants.Plan",   on_delete=models.PROTECT)
    status                = models.CharField(max_length=15, choices=STATUS_CHOICES, default=ACTIVE)
    current_period_start  = models.DateField(null=True, blank=True)
    current_period_end    = models.DateField(null=True, blank=True)
    next_billing_date     = models.DateField(null=True, blank=True)
    asaas_subscription_id = models.CharField(max_length=50, blank=True)
    created_at            = models.DateTimeField(auto_now_add=True)
    updated_at            = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Assinatura"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.tenant} — {self.plan} ({self.status})"


class Invoice(models.Model):
    PENDING   = "pending"
    PAID      = "paid"
    OVERDUE   = "overdue"
    CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (PENDING,   "Pendente"),
        (PAID,      "Pago"),
        (OVERDUE,   "Vencido"),
        (CANCELLED, "Cancelado"),
    ]

    BOLETO      = "boleto"
    PIX         = "pix"
    CREDIT_CARD = "credit_card"

    METHOD_CHOICES = [
        (BOLETO,      "Boleto"),
        (PIX,         "PIX"),
        (CREDIT_CARD, "Cartão de crédito"),
    ]

    tenant           = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="invoices")
    subscription     = models.ForeignKey(Subscription, on_delete=models.SET_NULL, null=True, blank=True)
    amount           = models.DecimalField("Valor (R$)", max_digits=8, decimal_places=2)
    due_date         = models.DateField("Vencimento")
    status           = models.CharField("Status", max_length=15, choices=STATUS_CHOICES, default=PENDING)
    payment_method   = models.CharField("Forma de pagamento", max_length=15, choices=METHOD_CHOICES, default=BOLETO)

    # Asaas
    asaas_payment_id = models.CharField(max_length=50, blank=True)
    boleto_url       = models.URLField(blank=True)
    boleto_barcode   = models.CharField(max_length=100, blank=True)
    pix_qrcode       = models.TextField(blank=True)
    pix_copy_paste   = models.CharField(max_length=300, blank=True)
    invoice_url      = models.URLField(blank=True)

    paid_at          = models.DateTimeField(null=True, blank=True)
    description      = models.CharField(max_length=200, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Fatura"
        verbose_name_plural = "Faturas"
        ordering = ["-due_date"]

    def __str__(self):
        return f"{self.tenant} — R${self.amount} ({self.get_status_display()})"
