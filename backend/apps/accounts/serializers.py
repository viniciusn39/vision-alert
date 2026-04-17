from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model

User = get_user_model()


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
    class Meta:
        model = User
        fields = ["id", "email", "name", "role", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["email", "name", "role", "password"]

    def validate_role(self, value):
        allowed = [User.TENANT_ADMIN, User.TENANT_OPERATOR, User.TENANT_VIEWER]
        request = self.context.get("request")
        if request and not request.user.is_superadmin:
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
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Senha atual incorreta.")
        return value
