from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from apps.tenants.permissions import IsTenantMember, IsTenantAdmin
from apps.cameras.models import TenantQuerysetMixin
from .models import AlertRule, Alert
from .serializers import AlertRuleSerializer, AlertSerializer

from rest_framework.pagination import PageNumberPagination
class NoPagination(PageNumberPagination):
    page_size = None

class AlertRuleViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    pagination_class = NoPagination
    queryset = AlertRule.objects.all()
    serializer_class = AlertRuleSerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    filterset_fields = ["behavior","severity","is_active"]

    def perform_create(self, serializer):
        tenant = self.request.tenant
        if tenant.alert_rules.count() >= tenant.plan.max_rules:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(f"Limite de regras do plano atingido ({tenant.plan.max_rules}).")
        serializer.save(tenant=tenant)

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        rule = self.get_object()
        rule.is_active = not rule.is_active
        rule.save(update_fields=["is_active"])
        return Response({"is_active": rule.is_active})

class AlertViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AlertSerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status","camera","rule"]

    def get_queryset(self):
        return Alert.objects.filter(rule__tenant=self.request.tenant).select_related("rule","camera")

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        a = self.get_object()
        a.status = "acknowledged"
        a.save(update_fields=["status"])
        return Response({"status": "acknowledged"})

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        a = self.get_object()
        a.status = "resolved"
        a.resolved_at = timezone.now()
        a.save(update_fields=["status","resolved_at"])
        return Response({"status": "resolved"})

    @action(detail=False, methods=["get"])
    def stats(self, request):
        from django.db.models import Count
        from django.db.models.functions import TruncHour
        from datetime import timedelta
        since = timezone.now() - timedelta(hours=24)
        qs    = Alert.objects.filter(rule__tenant=request.tenant, triggered_at__gte=since)
        by_hour = list(qs.annotate(hour=TruncHour("triggered_at")).values("hour").annotate(count=Count("id")).order_by("hour"))
        return Response({
            "total_today":    qs.count(),
            "critical_today": qs.filter(rule__severity="critical").count(),
            "open_alerts":    Alert.objects.filter(rule__tenant=request.tenant, status="open").count(),
            "by_hour":        by_hour,
        })
