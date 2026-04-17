from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("E-mail obrigatório")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", User.SUPERADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    SUPERADMIN       = "superadmin"
    PARTNER_ADMIN    = "partner_admin"
    TENANT_ADMIN     = "tenant_admin"
    TENANT_OPERATOR  = "tenant_operator"
    TENANT_VIEWER    = "tenant_viewer"

    ROLE_CHOICES = [
        (SUPERADMIN,      "Super Admin"),
        (PARTNER_ADMIN,   "Admin da Revenda"),
        (TENANT_ADMIN,    "Admin do Cliente"),
        (TENANT_OPERATOR, "Operador"),
        (TENANT_VIEWER,   "Visualizador"),
    ]

    email      = models.EmailField("E-mail", unique=True)
    name       = models.CharField("Nome", max_length=150)
    role       = models.CharField("Perfil", max_length=20, choices=ROLE_CHOICES, default=TENANT_OPERATOR)
    tenant     = models.ForeignKey(
        "tenants.Tenant", null=True, blank=True,
        on_delete=models.CASCADE, related_name="users"
    )
    partner    = models.ForeignKey(
        "tenants.Partner", null=True, blank=True,
        on_delete=models.CASCADE, related_name="users"
    )
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["name"]

    objects = UserManager()

    class Meta:
        verbose_name = "Usuário"
        verbose_name_plural = "Usuários"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} <{self.email}>"

    @property
    def is_superadmin(self):
        return self.role == self.SUPERADMIN

    @property
    def is_partner_admin(self):
        return self.role == self.PARTNER_ADMIN

    @property
    def is_tenant_admin(self):
        return self.role == self.TENANT_ADMIN
