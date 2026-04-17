from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    LoginView, MeView, ChangePasswordView,
    TenantUserListCreateView, TenantUserDetailView
)

urlpatterns = [
    path("login/",           LoginView.as_view()),
    path("token/refresh/",   TokenRefreshView.as_view()),
    path("me/",              MeView.as_view()),
    path("change-password/", ChangePasswordView.as_view()),
    path("users/",           TenantUserListCreateView.as_view()),
    path("users/<int:pk>/",  TenantUserDetailView.as_view()),
]
