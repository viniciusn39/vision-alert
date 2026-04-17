"""
Views de billing. Mudanças:

- AsaasWebhookView:
  * IP allowlist (ASAAS_WEBHOOK_IP_ALLOWLIST), se configurado
  * Token estático ainda é verificado (constant-time)
  * Double-check via GET /payments/{id} antes de marcar como pago —
    impede que um webhook forjado com token em mãos ative um tenant
    que não pagou de fato
  * transaction.atomic + select_for_update na Invoice (idempotência real)
- Throttling mais permissivo para webhook (Asaas pode retentar em rajada).
"""
import hmac
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.tenants.permissions import IsSuperAdmin, IsTenantAdmin

from .models import Invoice, Subscription
from .serializers import InvoiceSerializer, SubscriptionSerializer

logger = logging.getLogger(__name__)


class NoPagination(PageNumberPagination):
    page_size = None


class InvoiceListView(generics.ListAPIView):
    pagination_class = NoPagination
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return Invoice.objects.filter(tenant=self.request.tenant).order_by("-due_date")


class InvoiceDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return Invoice.objects.filter(tenant=self.request.tenant)


class SubscriptionView(APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def get(self, request):
        sub = Subscription.objects.filter(
            tenant=request.tenant, status=Subscription.ACTIVE
        ).first()
        if not sub:
            return Response({"detail": "Sem assinatura ativa."}, status=404)
        return Response(SubscriptionSerializer(sub).data)

    def post(self, request):
        method = request.data.get("payment_method", "boleto")
        from .tasks import create_subscription_and_first_invoice
        create_subscription_and_first_invoice.delay(request.tenant.id, method)
        return Response({"detail": "Assinatura sendo processada."})


# ── Webhook Asaas ─────────────────────────────────────────────────────────────

class WebhookThrottle(AnonRateThrottle):
    """Asaas pode retentar em rajada; damos mais folga que o anon default."""
    rate = "120/min"


class AsaasWebhookView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [WebhookThrottle]

    def _client_ip(self, request):
        xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")

    def post(self, request):
        # 1. IP allowlist (se configurada)
        allowlist = settings.ASAAS_WEBHOOK_IP_ALLOWLIST
        if allowlist:
            ip = self._client_ip(request)
            if ip not in allowlist:
                logger.warning(f"Webhook rejeitado — IP {ip} não está na allowlist")
                return Response({"detail": "Forbidden"}, status=403)

        # 2. Token estático (constant-time)
        token = request.headers.get("asaas-webhook-token", "")
        expected = settings.ASAAS_WEBHOOK_TOKEN
        if expected:
            if not hmac.compare_digest(expected, token):
                logger.warning("Webhook rejeitado — token inválido")
                return Response({"detail": "Unauthorized"}, status=401)

        event = request.data.get("event", "")
        payment = request.data.get("payment") or {}
        payment_id = payment.get("id", "")

        logger.info(f"Asaas webhook: {event} — {payment_id}")

        if not payment_id:
            return Response({"received": True, "note": "no payment id"})

        if event in ("PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"):
            self._handle_paid(payment_id)
        elif event == "PAYMENT_OVERDUE":
            self._handle_overdue(payment_id)
        elif event in ("PAYMENT_DELETED", "PAYMENT_REFUNDED"):
            self._handle_cancelled(payment_id)

        return Response({"received": True})

    def _handle_paid(self, payment_id):
        """
        Double-check: antes de marcar como pago, consulta Asaas direto.
        Um webhook forjado não consegue fazer o Asaas reportar o pagamento
        como RECEIVED/CONFIRMED — a verificação server-to-server é a
        fonte de verdade.
        """
        from apps.tenants.models import Tenant
        from .services import AsaasService

        svc = AsaasService()
        real = svc.get_payment(payment_id)
        if not real:
            logger.warning(f"Webhook PAID ignorado: não consegui confirmar {payment_id} via API")
            return
        real_status = (real.get("status") or "").upper()
        if real_status not in ("RECEIVED", "CONFIRMED"):
            logger.warning(
                f"Webhook PAID ignorado: status real do Asaas é {real_status} (não pago)"
            )
            return

        with transaction.atomic():
            try:
                inv = Invoice.objects.select_for_update().get(asaas_payment_id=payment_id)
            except Invoice.DoesNotExist:
                logger.warning(f"Invoice não encontrada para payment {payment_id}")
                return

            if inv.status == Invoice.PAID:
                # Já processado — idempotente
                return

            inv.status = Invoice.PAID
            inv.paid_at = timezone.now()
            inv.save(update_fields=["status", "paid_at"])

            tenant = Tenant.objects.select_for_update().get(pk=inv.tenant_id)
            if tenant.status in (Tenant.SUSPENDED, Tenant.TRIAL):
                tenant.status = Tenant.ACTIVE
                tenant.save(update_fields=["status"])
            logger.info(f"Invoice {inv.id} paid → tenant {tenant} ativo")

    def _handle_overdue(self, payment_id):
        with transaction.atomic():
            try:
                inv = Invoice.objects.select_for_update().get(asaas_payment_id=payment_id)
                if inv.status != Invoice.PAID:
                    inv.status = Invoice.OVERDUE
                    inv.save(update_fields=["status"])
            except Invoice.DoesNotExist:
                pass

    def _handle_cancelled(self, payment_id):
        with transaction.atomic():
            try:
                inv = Invoice.objects.select_for_update().get(asaas_payment_id=payment_id)
                inv.status = Invoice.CANCELLED
                inv.save(update_fields=["status"])
            except Invoice.DoesNotExist:
                pass


class AdminInvoiceListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    serializer_class = InvoiceSerializer
    filterset_fields = ["status", "payment_method", "tenant"]

    def get_queryset(self):
        return Invoice.objects.select_related("tenant").order_by("-due_date")
