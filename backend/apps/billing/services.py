import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class AsaasService:
    """Wrapper for Asaas API v3."""

    def __init__(self):
        self.base = settings.ASAAS_BASE_URL
        self.headers = {
            "access_token": settings.ASAAS_API_KEY,
            "Content-Type": "application/json",
        }

    def _post(self, endpoint, data):
        try:
            r = requests.post(f"{self.base}{endpoint}", json=data, headers=self.headers, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"Asaas POST {endpoint} error: {e}")
            return None

    def _get(self, endpoint):
        try:
            r = requests.get(f"{self.base}{endpoint}", headers=self.headers, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"Asaas GET {endpoint} error: {e}")
            return None

    def create_customer(self, tenant):
        data = {
            "name":  tenant.company_name,
            "email": tenant.email,
            "phone": tenant.phone or "",
            "cpfCnpj": tenant.cnpj.replace(".", "").replace("/", "").replace("-", "") if tenant.cnpj else "",
            "externalReference": str(tenant.id),
        }
        result = self._post("/customers", data)
        if result and "id" in result:
            return result["id"]
        return None

    def create_subscription(self, tenant, plan):
        """Creates a recurring monthly subscription in Asaas."""
        from datetime import date
        from dateutil.relativedelta import relativedelta
        next_due = date.today() + relativedelta(months=1)

        data = {
            "customer":     tenant.asaas_customer_id,
            "billingType":  "BOLETO",
            "value":        float(plan.price),
            "nextDueDate":  next_due.strftime("%Y-%m-%d"),
            "cycle":        "MONTHLY",
            "description":  f"VisionAlert — Plano {plan.display_name}",
            "externalReference": str(tenant.id),
        }
        result = self._post("/subscriptions", data)
        if result and "id" in result:
            return result
        return None

    def create_payment(self, tenant, amount, due_date, description, method="BOLETO"):
        """Creates a single payment charge."""
        data = {
            "customer":    tenant.asaas_customer_id,
            "billingType": method.upper().replace("CREDIT_CARD", "CREDIT_CARD"),
            "value":       float(amount),
            "dueDate":     due_date.strftime("%Y-%m-%d") if hasattr(due_date, "strftime") else str(due_date),
            "description": description,
            "externalReference": str(tenant.id),
        }
        return self._post("/payments", data)

    def get_payment_pix(self, payment_id):
        return self._get(f"/payments/{payment_id}/pixQrCode")

    def get_payment(self, payment_id):
        return self._get(f"/payments/{payment_id}")
