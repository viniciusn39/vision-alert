from django.urls import path
from .views import (
    InvoiceListView, InvoiceDetailView, SubscriptionView,
    AsaasWebhookView, AdminInvoiceListView
)

urlpatterns = [
    path("webhook/",              AsaasWebhookView.as_view()),
    path("invoices/",             InvoiceListView.as_view()),
    path("invoices/<int:pk>/",    InvoiceDetailView.as_view()),
    path("subscription/",         SubscriptionView.as_view()),
    path("admin/invoices/",       AdminInvoiceListView.as_view()),
]
