from django.urls import path
from . import views

urlpatterns = [
    # Edge device endpoints (called by edge agents)
    path("heartbeat/", views.HeartbeatView.as_view()),
    path("sync/", views.SyncConfigView.as_view()),
    path("alert/", views.ReportAlertView.as_view()),
    path("metrics/", views.ReportMetricsView.as_view()),
    path("visitors/", views.ReportVisitorCountView.as_view()),
    path("logs/", views.DeviceLogView.as_view()),
    path("register/", views.RegisterDeviceView.as_view()),

    # Admin endpoints (called by Angular frontend, requires superadmin JWT)
    path("admin/devices/", views.AdminDeviceListView.as_view()),
    path("admin/devices/<uuid:pk>/logs/", views.AdminDeviceLogsView.as_view()),
    path("admin/provision/", views.AdminProvisionView.as_view()),
]
