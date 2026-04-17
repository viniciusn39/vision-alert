from django.urls import path
from .views import PartnerDashboardView, PartnerClientListView

urlpatterns = [
    path("dashboard/", PartnerDashboardView.as_view()),
    path("clients/",   PartnerClientListView.as_view()),
]
