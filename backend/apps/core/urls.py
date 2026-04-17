from django.urls import path
from .views import DashboardStatsView, SystemConfigView, SystemMetricsView
from apps.tenants.urls import urlpatterns as tenant_urls

urlpatterns = [
    path("dashboard/stats/", DashboardStatsView.as_view()),
    path("system/config/", SystemConfigView.as_view()),
    path("system/metrics/", SystemMetricsView.as_view()),
] + tenant_urls
