from rest_framework import serializers
from .models import Plan, Partner, Tenant, TenantSettings


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ["id", "name", "display_name", "price", "max_cameras", "max_users",
                  "max_rules", "trial_days", "features", "is_active", "sort_order"]


class PartnerSerializer(serializers.ModelSerializer):
    clients_count = serializers.ReadOnlyField()

    class Meta:
        model = Partner
        fields = ["id", "company_name", "cnpj", "email", "phone",
                  "commission_rate", "is_active", "clients_count", "notes", "created_at"]


class TenantSerializer(serializers.ModelSerializer):
    plan_name        = serializers.CharField(source="plan.display_name", read_only=True)
    partner_name     = serializers.CharField(source="partner.company_name", read_only=True)
    cameras_count    = serializers.ReadOnlyField()
    users_count      = serializers.ReadOnlyField()
    rules_count      = serializers.ReadOnlyField()
    is_active_or_trial = serializers.ReadOnlyField()

    class Meta:
        model = Tenant
        fields = ["id", "company_name", "cnpj", "phone", "email", "plan", "plan_name",
                  "partner", "partner_name", "status", "trial_ends_at",
                  "cameras_count", "users_count", "rules_count",
                  "is_active_or_trial", "created_at"]
        read_only_fields = ["id", "created_at", "asaas_customer_id"]


class TenantSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = TenantSettings
        fields = ["id", "telegram_token", "telegram_chat_id", "alert_email",
                  "whatsapp_number", "logo", "logo_url", "updated_at"]
        extra_kwargs = {"telegram_token": {"write_only": True}, "logo": {"write_only": True}}

    def get_logo_url(self, obj):
        request = self.context.get("request")
        if obj.logo and request:
            return request.build_absolute_uri(obj.logo.url)
        return None


class TenantRegisterSerializer(serializers.Serializer):
    """Used during self-registration (new tenant signup)."""
    company_name = serializers.CharField(max_length=150)
    cnpj         = serializers.CharField(max_length=18, required=False, allow_blank=True)
    phone        = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email        = serializers.EmailField()
    plan_id      = serializers.IntegerField()
    partner_code = serializers.CharField(required=False, allow_blank=True)
    admin_name   = serializers.CharField(max_length=150)
    admin_email  = serializers.EmailField()
    admin_password = serializers.CharField(min_length=6, write_only=True)

    def validate_email(self, value):
        if Tenant.objects.filter(email=value).exists():
            raise serializers.ValidationError("E-mail já cadastrado.")
        return value

    def validate_admin_email(self, value):
        from django.contrib.auth import get_user_model
        if get_user_model().objects.filter(email=value).exists():
            raise serializers.ValidationError("E-mail de usuário já cadastrado.")
        return value

    def validate_plan_id(self, value):
        if not Plan.objects.filter(pk=value, is_active=True).exists():
            raise serializers.ValidationError("Plano inválido.")
        return value
