from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema")),
    # Auth
    path("api/auth/", include("apps.accounts.urls")),
    # Superadmin
    path("api/admin/", include("apps.tenants.admin_urls")),
    # Partner
    path("api/partner/", include("apps.tenants.partner_urls")),
    # Tenant public
    path("api/tenants/", include("apps.tenants.urls")),
    # Billing (webhook público + área do tenant)
    path("api/billing/", include("apps.billing.urls")),
    # Tenant resources
    path("api/", include("apps.cameras.urls")),
    path("api/", include("apps.alerts.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.locations.urls")),
    path("api/fleet/", include("apps.fleet.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
