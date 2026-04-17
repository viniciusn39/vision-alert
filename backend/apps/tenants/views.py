from rest_framework import viewsets, generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import Plan, Partner, Tenant, TenantSettings
from .serializers import PlanSerializer, PartnerSerializer, TenantSerializer, TenantSettingsSerializer, TenantRegisterSerializer
from .permissions import IsSuperAdmin, IsPartnerAdmin, IsTenantAdmin, IsSuperAdminOrPartner

User = get_user_model()

class PlanListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PlanSerializer
    queryset = Plan.objects.filter(is_active=True).order_by("sort_order")

class TenantRegisterView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        ser = TenantRegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        plan = Plan.objects.get(pk=data["plan_id"])
        partner = None
        if data.get("partner_code"):
            partner = Partner.objects.filter(email=data["partner_code"], is_active=True).first()
        tenant = Tenant.objects.create(company_name=data["company_name"], cnpj=data.get("cnpj",""), phone=data.get("phone",""), email=data["email"], plan=plan, partner=partner, status=Tenant.TRIAL)
        TenantSettings.objects.create(tenant=tenant)
        admin = User.objects.create_user(email=data["admin_email"], password=data["admin_password"], name=data["admin_name"], role=User.TENANT_ADMIN, tenant=tenant)
        from apps.billing.tasks import create_asaas_customer
        create_asaas_customer.delay(tenant.id)
        from apps.notifications.tasks import send_welcome_email
        send_welcome_email.delay(admin.id)
        return Response({"detail": "Conta criada!", "tenant_id": tenant.id, "email": admin.email}, status=status.HTTP_201_CREATED)

class TenantSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    def get(self, request):
        cfg, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        return Response(TenantSettingsSerializer(cfg, context={"request": request}).data)
    def patch(self, request):
        cfg, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        ser = TenantSettingsSerializer(cfg, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

class TenantProfileView(APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    def get(self, request):
        return Response(TenantSerializer(request.tenant).data)
    def patch(self, request):
        allowed = ["company_name", "cnpj", "phone"]
        data = {k: v for k, v in request.data.items() if k in allowed}
        ser = TenantSerializer(request.tenant, data=data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

class AdminPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    serializer_class = PlanSerializer
    queryset = Plan.objects.all()

class AdminPartnerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    serializer_class = PartnerSerializer
    queryset = Partner.objects.all()
    search_fields = ["company_name", "email", "cnpj"]
    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        partner = self.get_object()
        partner.is_active = not partner.is_active
        partner.save(update_fields=["is_active"])
        return Response({"is_active": partner.is_active})

class AdminTenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    serializer_class = TenantSerializer
    queryset = Tenant.objects.select_related("plan", "partner").all()
    search_fields = ["company_name", "email", "cnpj"]
    filterset_fields = ["status", "plan", "partner"]
    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        t = self.get_object(); t.status = Tenant.SUSPENDED; t.save(update_fields=["status"])
        return Response({"status": t.status})
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        t = self.get_object(); t.status = Tenant.ACTIVE; t.save(update_fields=["status"])
        return Response({"status": t.status})
    @action(detail=True, methods=["post"])
    def change_plan(self, request, pk=None):
        t = self.get_object()
        try:
            plan = Plan.objects.get(pk=request.data.get("plan_id"))
            t.plan = plan; t.save(update_fields=["plan"])
            return Response({"plan": plan.display_name})
        except Plan.DoesNotExist:
            return Response({"detail": "Plano não encontrado."}, status=400)

class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    def get(self, request):
        from apps.billing.models import Invoice
        from django.db.models import Sum
        return Response({
            "tenants":  {"total": Tenant.objects.count(), "trial": Tenant.objects.filter(status="trial").count(), "active": Tenant.objects.filter(status="active").count(), "suspended": Tenant.objects.filter(status="suspended").count()},
            "partners": {"total": Partner.objects.count(), "active": Partner.objects.filter(is_active=True).count()},
            "mrr": float(Invoice.objects.filter(status="paid").aggregate(t=Sum("amount"))["t"] or 0),
            "invoices": {"pending": Invoice.objects.filter(status="pending").count(), "overdue": Invoice.objects.filter(status="overdue").count()},
        })

class PartnerDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsPartnerAdmin]
    def get(self, request):
        from apps.billing.models import Invoice
        from django.db.models import Sum
        partner = request.user.partner
        tenants = Tenant.objects.filter(partner=partner)
        paid = Invoice.objects.filter(tenant__partner=partner, status="paid").aggregate(t=Sum("amount"))["t"] or 0
        commission = float(paid) * float(partner.commission_rate) / 100
        return Response({"partner": PartnerSerializer(partner).data, "clients": {"total": tenants.count(), "active": tenants.filter(status="active").count(), "trial": tenants.filter(status="trial").count(), "suspended": tenants.filter(status="suspended").count()}, "commission_total": round(commission, 2), "revenue_base": float(paid)})

class PartnerClientListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsPartnerAdmin]
    serializer_class = TenantSerializer
    def get_queryset(self):
        return Tenant.objects.filter(partner=self.request.user.partner).select_related("plan")
