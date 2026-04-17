"""
Tasks de billing.

Correções:
- create_subscription_and_first_invoice agora cria tanto a Subscription
  quanto a primeira Invoice (antes só criava a Subscription, apesar do nome).
- Se o customer do Asaas ainda não existe, cria sob demanda.
- Tratamento explícito de falhas: se Asaas retornar erro, a Subscription
  não é criada localmente e o erro é logado para investigação.
"""
import logging
from datetime import timedelta, date

from celery import shared_task
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(queue="default")
def create_asaas_customer(tenant_id: int):
    from apps.tenants.models import Tenant
    from .services import AsaasService
    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        if tenant.asaas_customer_id:
            return tenant.asaas_customer_id
        svc = AsaasService()
        customer_id = svc.create_customer(tenant)
        if customer_id:
            tenant.asaas_customer_id = customer_id
            tenant.save(update_fields=["asaas_customer_id"])
            logger.info(f"Asaas customer criado para {tenant}: {customer_id}")
            return customer_id
    except Exception as e:
        logger.exception(f"create_asaas_customer error: {e}")
    return None


@shared_task(queue="default")
def create_subscription_and_first_invoice(tenant_id: int, payment_method: str = "boleto"):
    """Cria subscription no Asaas + primeira Invoice local."""
    from apps.tenants.models import Tenant
    from .models import Subscription, Invoice
    from .services import AsaasService

    try:
        tenant = Tenant.objects.get(pk=tenant_id)
    except Tenant.DoesNotExist:
        logger.error(f"Tenant {tenant_id} não existe")
        return

    # 1. Garantir customer no Asaas
    if not tenant.asaas_customer_id:
        cust_id = create_asaas_customer(tenant_id)
        if not cust_id:
            logger.error(f"Falha ao criar customer Asaas para tenant {tenant_id}")
            return
        tenant.refresh_from_db()

    svc = AsaasService()

    # 2. Criar subscription recorrente no Asaas
    result = svc.create_subscription(tenant, tenant.plan)
    if not result:
        logger.error(f"Asaas não aceitou a subscription do tenant {tenant_id}")
        return

    # 3. Criar Subscription e Invoice locais em uma transação
    try:
        with transaction.atomic():
            sub = Subscription.objects.create(
                tenant=tenant,
                plan=tenant.plan,
                status=Subscription.ACTIVE,
                current_period_start=date.today(),
                current_period_end=date.today() + timedelta(days=30),
                next_billing_date=date.today() + timedelta(days=30),
                asaas_subscription_id=result["id"],
            )

            # Primeira cobrança avulsa para ativação imediata
            first_due = date.today() + timedelta(days=3)
            method_map = {"boleto": "BOLETO", "pix": "PIX", "credit_card": "CREDIT_CARD"}
            method = method_map.get(payment_method, "BOLETO")
            payment = svc.create_payment(
                tenant=tenant,
                amount=tenant.plan.price,
                due_date=first_due,
                description=f"Ativação — Plano {tenant.plan.display_name}",
                method=method,
            )

            invoice_kwargs = {
                "tenant": tenant,
                "subscription": sub,
                "amount": tenant.plan.price,
                "due_date": first_due,
                "status": Invoice.PENDING,
                "payment_method": payment_method,
                "description": f"Primeira cobrança — {tenant.plan.display_name}",
            }

            if payment and payment.get("id"):
                invoice_kwargs["asaas_payment_id"] = payment["id"]
                invoice_kwargs["invoice_url"] = payment.get("invoiceUrl", "") or ""
                invoice_kwargs["boleto_url"] = payment.get("bankSlipUrl", "") or ""
                # PIX: buscar QR code separadamente, se for o caso
                if payment_method == "pix":
                    pix_data = svc.get_payment_pix(payment["id"])
                    if pix_data:
                        invoice_kwargs["pix_qrcode"] = pix_data.get("encodedImage", "") or ""
                        invoice_kwargs["pix_copy_paste"] = pix_data.get("payload", "") or ""

            Invoice.objects.create(**invoice_kwargs)

            # Mantém tenant em TRIAL até o pagamento confirmar via webhook —
            # não promove para ACTIVE aqui.

        logger.info(f"Subscription + invoice criadas para {tenant}")
    except Exception as e:
        logger.exception(f"create_subscription error: {e}")


@shared_task(queue="default")
def check_overdue_invoices():
    """Roda diariamente — marca vencidas e suspende tenants com mais de 5 dias."""
    from apps.tenants.models import Tenant
    from .models import Invoice

    today = date.today()
    Invoice.objects.filter(status=Invoice.PENDING, due_date__lt=today).update(
        status=Invoice.OVERDUE
    )

    cutoff = today - timedelta(days=5)
    to_suspend = list(
        Invoice.objects.filter(
            status=Invoice.OVERDUE,
            due_date__lte=cutoff,
            tenant__status=Tenant.ACTIVE,
        ).values_list("tenant_id", flat=True).distinct()
    )

    if to_suspend:
        Tenant.objects.filter(pk__in=to_suspend).update(status=Tenant.SUSPENDED)
        logger.info(f"Suspensos {len(to_suspend)} tenants por faturas em atraso")


@shared_task(queue="default")
def check_trial_expirations():
    """Roda diariamente — suspende trials expirados."""
    from apps.tenants.models import Tenant
    count = Tenant.objects.filter(
        status=Tenant.TRIAL, trial_ends_at__lt=timezone.now()
    ).update(status=Tenant.SUSPENDED)
    logger.info(f"Suspensos {count} trials expirados")
