from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import (
    AdminPlanViewSet, AdminPartnerViewSet, AdminTenantViewSet, AdminDashboardView
)

router = DefaultRouter()
router.register("plans",    AdminPlanViewSet,   basename="admin-plans")
router.register("partners", AdminPartnerViewSet, basename="admin-partners")
router.register("tenants",  AdminTenantViewSet,  basename="admin-tenants")

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view()),
] + router.urls
