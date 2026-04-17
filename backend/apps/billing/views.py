import logging
import hashlib
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.conf import settings
from django.utils import timezone
from .models import Invoice, Subscription
from .serializers import InvoiceSerializer, SubscriptionSerializer
from apps.tenants.permissions import IsTenantAdmin, IsSuperAdmin

logger = logging.getLogger(__name__)


from rest_framework.pagination import PageNumberPagination
class NoPagination(PageNumberPagination):
    page_size = None

class InvoiceListView(generics.ListAPIView):
    pagination_class = NoPagination
    """Tenant sees own invoices."""
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
    """Tenant sees/manages subscription."""
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def get(self, request):
        sub = Subscription.objects.filter(
            tenant=request.tenant, status=Subscription.ACTIVE
        ).first()
        if not sub:
            return Response({"detail": "Sem assinatura ativa."}, status=404)
        return Response(SubscriptionSerializer(sub).data)

    def post(self, request):
        """Activate subscription after trial."""
        method = request.data.get("payment_method", "boleto")
        from .tasks import create_subscription_and_first_invoice
        create_subscription_and_first_invoice.delay(request.tenant.id, method)
        return Response({"detail": "Assinatura sendo processada."})


class AsaasWebhookView(APIView):
    """Receives payment events from Asaas."""
    permission_classes = [AllowAny]

    def post(self, request):
        # Validate webhook token
        token = request.headers.get("asaas-webhook-token", "")
        if settings.ASAAS_WEBHOOK_TOKEN and token != settings.ASAAS_WEBHOOK_TOKEN:
            return Response({"detail": "Unauthorized"}, status=401)

        event = request.data.get("event", "")
        payment = request.data.get("payment", {})
        payment_id = payment.get("id", "")

        logger.info(f"Asaas webhook: {event} — {payment_id}")

        if event == "PAYMENT_CONFIRMED" or event == "PAYMENT_RECEIVED":
            self._handle_paid(payment_id, payment)
        elif event == "PAYMENT_OVERDUE":
            self._handle_overdue(payment_id)
        elif event == "PAYMENT_DELETED" or event == "PAYMENT_REFUNDED":
            self._handle_cancelled(payment_id)

        return Response({"received": True})

    def _handle_paid(self, payment_id, payment_data):
        from apps.tenants.models import Tenant
        try:
            inv = Invoice.objects.get(asaas_payment_id=payment_id)
            inv.status = Invoice.PAID
            inv.paid_at = timezone.now()
            inv.save(update_fields=["status", "paid_at"])
            # Activate tenant if suspended
            tenant = inv.tenant
            if tenant.status in [Tenant.SUSPENDED, Tenant.TRIAL]:
                tenant.status = Tenant.ACTIVE
                tenant.save(update_fields=["status"])
            logger.info(f"Invoice {inv.id} paid — tenant {tenant} activated")
        except Invoice.DoesNotExist:
            logger.warning(f"Invoice not found for payment {payment_id}")

    def _handle_overdue(self, payment_id):
        try:
            inv = Invoice.objects.get(asaas_payment_id=payment_id)
            inv.status = Invoice.OVERDUE
            inv.save(update_fields=["status"])
        except Invoice.DoesNotExist:
            pass

    def _handle_cancelled(self, payment_id):
        try:
            inv = Invoice.objects.get(asaas_payment_id=payment_id)
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
