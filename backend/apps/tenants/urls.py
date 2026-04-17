from django.urls import path
from .views import PlanListView, TenantRegisterView, TenantSettingsView, TenantProfileView

urlpatterns = [
    path("plans/",    PlanListView.as_view()),
    path("register/", TenantRegisterView.as_view()),
    path("settings/", TenantSettingsView.as_view()),
    path("profile/",  TenantProfileView.as_view()),
]
