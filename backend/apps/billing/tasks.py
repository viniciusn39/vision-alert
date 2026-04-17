import logging
from celery import shared_task
from django.utils import timezone
from datetime import timedelta, date

logger = logging.getLogger(__name__)


@shared_task(queue="default")
def create_asaas_customer(tenant_id: int):
    from apps.tenants.models import Tenant
    from .services import AsaasService
    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        if tenant.asaas_customer_id:
            return
        svc = AsaasService()
        customer_id = svc.create_customer(tenant)
        if customer_id:
            tenant.asaas_customer_id = customer_id
            tenant.save(update_fields=["asaas_customer_id"])
            logger.info(f"Asaas customer created for {tenant}: {customer_id}")
    except Exception as e:
        logger.error(f"create_asaas_customer error: {e}")


@shared_task(queue="default")
def create_subscription_and_first_invoice(tenant_id: int, payment_method: str = "boleto"):
    from apps.tenants.models import Tenant
    from .models import Subscription, Invoice
    from .services import AsaasService
    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        svc = AsaasService()
        result = svc.create_subscription(tenant, tenant.plan)
        if not result:
            return

        sub = Subscription.objects.create(
            tenant=tenant,
            plan=tenant.plan,
            status=Subscription.ACTIVE,
            current_period_start=date.today(),
            asaas_subscription_id=result["id"],
        )
        tenant.status = Tenant.ACTIVE
        tenant.save(update_fields=["status"])
        logger.info(f"Subscription created for {tenant}")
    except Exception as e:
        logger.error(f"create_subscription error: {e}")


@shared_task(queue="default")
def check_overdue_invoices():
    """Run daily — mark overdue and suspend tenants after 5 days."""
    from .models import Invoice
    from apps.tenants.models import Tenant

    today = date.today()
    # Mark overdue
    overdue = Invoice.objects.filter(status=Invoice.PENDING, due_date__lt=today)
    overdue.update(status=Invoice.OVERDUE)

    # Suspend tenants with invoices overdue > 5 days
    cutoff = today - timedelta(days=5)
    to_suspend = Invoice.objects.filter(
        status=Invoice.OVERDUE,
        due_date__lte=cutoff,
        tenant__status=Tenant.ACTIVE,
    ).values_list("tenant_id", flat=True).distinct()

    Tenant.objects.filter(pk__in=to_suspend).update(status=Tenant.SUSPENDED)
    logger.info(f"Suspended {len(to_suspend)} tenants for overdue invoices")


@shared_task(queue="default")
def check_trial_expirations():
    """Run daily — suspend expired trials."""
    from apps.tenants.models import Tenant
    expired = Tenant.objects.filter(status=Tenant.TRIAL, trial_ends_at__lt=timezone.now())
    count = expired.update(status=Tenant.SUSPENDED)
    logger.info(f"Suspended {count} expired trial tenants")
