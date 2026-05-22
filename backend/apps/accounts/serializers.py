from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

User = get_user_model()


def _run_password_validators(password, user=None):
    """Roda os AUTH_PASSWORD_VALIDATORS do Django e converte o erro
    para o formato do DRF. Centraliza a regra para criar/editar/trocar senha."""
    try:
        validate_password(password, user=user)
    except DjangoValidationError as e:
        raise serializers.ValidationError(list(e.messages))


class CustomTokenSerializer(TokenObtainPairSerializer):
    username_field = "email"

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["name"]           = user.name
        token["email"]          = user.email
        token["role"]           = user.role
        token["tenant_id"]      = user.tenant_id
        token["partner_id"]     = user.partner_id
        if user.tenant:
            token["plan"]           = user.tenant.plan.name if user.tenant.plan else None
            token["tenant_status"]  = user.tenant.status
            token["trial_ends_at"]  = str(user.tenant.trial_ends_at) if user.tenant.trial_ends_at else None
            token["company_name"]   = user.tenant.company_name
        return token


class UserSerializer(serializers.ModelSerializer):
    """Usado para listar e EDITAR usuários (TenantUserDetailView).

    O campo `password` é opcional e write-only: se vier preenchido num
    PATCH/PUT, o admin está redefinindo a senha daquele usuário; se vier
    vazio ou ausente, a senha atual é mantida intacta.
    """
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        style={"input_type": "password"}
    )

    class Meta:
        model = User
        fields = ["id", "email", "name", "role", "is_active", "created_at", "password"]
        read_only_fields = ["id", "created_at"]

    def validate_password(self, value):
        # Campo opcional na edição: em branco = não mexe na senha.
        if not value:
            return value
        _run_password_validators(value, user=self.instance)
        return value

    def validate_role(self, value):
        allowed = [User.TENANT_ADMIN, User.TENANT_OPERATOR, User.TENANT_VIEWER]
        request = self.context.get("request")
        if request and not getattr(request.user, "is_superadmin", False):
            if value not in allowed:
                raise serializers.ValidationError("Perfil inválido.")
        return value

    def update(self, instance, validated_data):
        # Extrai a senha antes do update padrão dos demais campos.
        new_password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if new_password:
            user.set_password(new_password)
            user.save(update_fields=["password"])
        return user


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["email", "name", "role", "password"]

    def validate_password(self, value):
        _run_password_validators(value)
        return value

    def validate_role(self, value):
        allowed = [User.TENANT_ADMIN, User.TENANT_OPERATOR, User.TENANT_VIEWER]
        request = self.context.get("request")
        if request and not getattr(request.user, "is_superadmin", False):
            if value not in allowed:
                raise serializers.ValidationError("Perfil inválido.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """Troca da PRÓPRIA senha — exige a senha antiga."""
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Senha atual incorreta.")
        return value

    def validate_new_password(self, value):
        _run_password_validators(value, user=self.context["request"].user)
        return value
