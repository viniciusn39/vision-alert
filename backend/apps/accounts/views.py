from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from .serializers import CustomTokenSerializer, UserSerializer, UserCreateSerializer, ChangePasswordSerializer
from apps.tenants.permissions import IsTenantAdmin, get_tenant

User = get_user_model()

class NoPagination(PageNumberPagination):
    page_size = None

class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenSerializer
    permission_classes = [AllowAny]

class MeView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(UserSerializer(request.user).data)
    def patch(self, request):
        ser = UserSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        request.user.set_password(ser.validated_data["new_password"])
        request.user.save()
        return Response({"detail": "Senha alterada com sucesso."})

class TenantUserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    pagination_class = NoPagination

    def get_queryset(self):
        tenant = get_tenant(self.request)
        if not tenant:
            return User.objects.none()
        return User.objects.filter(tenant=tenant).order_by("name")

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == "POST" else UserSerializer

    def perform_create(self, serializer):
        tenant = get_tenant(self.request)
        if not tenant:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Tenant not found.")
        plan = tenant.plan
        if plan and User.objects.filter(tenant=tenant).count() >= plan.max_users:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(f"Limite de {plan.max_users} usuários atingido.")
        serializer.save(tenant=tenant, role=serializer.validated_data.get("role", User.TENANT_OPERATOR))

class TenantUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    serializer_class = UserSerializer
    def get_queryset(self):
        tenant = get_tenant(self.request)
        if not tenant:
            return User.objects.none()
        return User.objects.filter(tenant=tenant)
