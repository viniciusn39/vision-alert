import logging, requests
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)

@shared_task(queue="default")
def send_alert_notifications(alert_id: int):
    from apps.alerts.models import Alert
    from apps.tenants.models import TenantSettings

    try:
        alert = Alert.objects.select_related("rule","camera","rule__tenant").get(pk=alert_id)
    except Alert.DoesNotExist:
        return

    try:
        cfg = alert.rule.tenant.settings
    except Exception:
        return

    channels = alert.rule.channels or []
    sev_icon = {"critical":"🚨","high":"⚠️","medium":"🔵","low":"🟢"}.get(alert.rule.severity,"🔔")
    msg = (
        f"{sev_icon} *{alert.rule.get_severity_display().upper()}* — {alert.rule.name}\n"
        f"📷 {alert.camera.name} ({alert.camera.location})\n"
        f"📝 {alert.description}\n"
        f"🕐 {alert.triggered_at.strftime('%d/%m/%Y %H:%M:%S')}"
    )

    if "telegram" in channels and cfg.telegram_token and cfg.telegram_chat_id:
        _telegram(cfg.telegram_token, cfg.telegram_chat_id, msg, alert)
    if "email" in channels and cfg.alert_email:
        _email(cfg.alert_email, alert, msg)
    if "webhook" in channels and alert.rule.webhook_url:
        _webhook(alert.rule.webhook_url, alert)

    from apps.alerts.models import Alert as A
    A.objects.filter(pk=alert_id).update(notified=True)


def _telegram(token, chat_id, text, alert):
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10
        )
        if alert.snapshot:
            requests.post(
                f"https://api.telegram.org/bot{token}/sendPhoto",
                data={"chat_id": chat_id},
                files={"photo": alert.snapshot.open("rb")},
                timeout=15
            )
    except Exception as e:
        logger.error(f"Telegram error: {e}")

def _email(to, alert, body):
    try:
        send_mail(
            subject=f"[VisionAlert] {alert.rule.get_severity_display()} — {alert.rule.name}",
            message=body.replace("*","").replace("🚨","[!]").replace("📷","[CAM]"),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to],
            fail_silently=True,
        )
    except Exception as e:
        logger.error(f"Email error: {e}")

def _webhook(url, alert):
    try:
        requests.post(url, json={
            "alert_id":    alert.id,
            "rule":        alert.rule.name,
            "severity":    alert.rule.severity,
            "camera":      alert.camera.name,
            "description": alert.description,
            "triggered_at":alert.triggered_at.isoformat(),
        }, timeout=10)
    except Exception as e:
        logger.error(f"Webhook error: {e}")


@shared_task(queue="default")
def send_welcome_email(user_id: int):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        user = User.objects.select_related("tenant","tenant__plan").get(pk=user_id)
        send_mail(
            subject="Bem-vindo ao VisionAlert!",
            message=(
                f"Olá {user.name},\n\n"
                f"Sua conta foi criada com sucesso.\n"
                f"Empresa: {user.tenant.company_name}\n"
                f"Plano: {user.tenant.plan.display_name}\n"
                f"Trial até: {user.tenant.trial_ends_at.strftime('%d/%m/%Y')}\n\n"
                f"Acesse: http://localhost:4200\n"
                f"Login: {user.email}\n\n"
                f"Equipe VisionAlert"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    except Exception as e:
        logger.error(f"Welcome email error: {e}")
