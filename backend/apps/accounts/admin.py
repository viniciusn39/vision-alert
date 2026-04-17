from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "name", "role", "tenant", "is_active")
    list_filter = ("role", "is_active", "tenant")
    search_fields = ("email", "name")
    ordering = ("email",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Informações", {"fields": ("name", "role", "tenant", "partner")}),
        ("Permissões", {"fields": ("is_active", "is_staff", "is_superuser")}),
    )
    add_fieldsets = (
        (None, {"fields": ("email", "name", "password1", "password2", "role", "tenant")}),
    )
    filter_horizontal = ()
