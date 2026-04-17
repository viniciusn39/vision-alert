from django.db import migrations, models
import django.contrib.auth.models

class Migration(migrations.Migration):
    initial = True
    dependencies = [("auth","0012_alter_user_first_name_max_length")]
    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                ("id",           models.BigAutoField(auto_created=True, primary_key=True)),
                ("password",     models.CharField(max_length=128)),
                ("last_login",   models.DateTimeField(blank=True, null=True)),
                ("is_superuser", models.BooleanField(default=False)),
                ("email",        models.EmailField(unique=True, verbose_name="E-mail")),
                ("name",         models.CharField(max_length=150, verbose_name="Nome")),
                ("role",         models.CharField(max_length=20, default="tenant_operator",
                    choices=[("superadmin","Super Admin"),("partner_admin","Admin da Revenda"),
                              ("tenant_admin","Admin do Cliente"),("tenant_operator","Operador"),
                              ("tenant_viewer","Visualizador")])),
                ("is_active",    models.BooleanField(default=True)),
                ("is_staff",     models.BooleanField(default=False)),
                ("created_at",   models.DateTimeField(auto_now_add=True)),
                ("updated_at",   models.DateTimeField(auto_now=True)),
                ("groups",       models.ManyToManyField(blank=True, related_name="user_set",
                    related_query_name="user", to="auth.group", verbose_name="groups")),
                ("user_permissions", models.ManyToManyField(blank=True, related_name="user_set",
                    related_query_name="user", to="auth.permission", verbose_name="user permissions")),
            ],
            options={"verbose_name":"Usuário","verbose_name_plural":"Usuários","ordering":["name"]},
            managers=[("objects", django.contrib.auth.models.BaseUserManager())],
        ),
    ]
