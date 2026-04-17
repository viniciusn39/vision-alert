"""
Endpoints consumidos pelo edge agent.

Mudanças desta versão:
- RegisterDeviceView agora exige FLEET_PROVISION_TOKEN. Sem o token certo,
  retorna 401. Fecha o bug crítico de registro público sem auth.
- Autenticação por API key agora usa hash comparison (constant-time).
- SyncConfigView elimina N+1 queries e NÃO retorna senhas RTSP em claro:
  as senhas vão cifradas com AES-GCM usando uma chave derivada da api_key
  do próprio device. Sem a api_key (que só mora no .env local do edge),
  o payload não serve pra nada mesmo se interceptado.
- Limite de tamanho em campos recebidos do heartbeat.
"""
import base64
import hashlib
import logging

from django.conf import settings
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import AnonRateThrottle

from apps.alerts.models import Alert, AlertRule
from apps.cameras.models import Camera
from apps.tenants.permissions import IsSuperAdmin
from .models import EdgeDevice, DeviceLog

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _truncate(s, limit=200):
    """Trunca string recebida do edge para evitar abuso."""
    if not isinstance(s, str):
        return ""
    return s[:limit]


def _client_ip(request):
    """IP real do cliente considerando proxy reverso."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _derive_cipher_key(api_key_hash: str) -> bytes:
    """Deriva chave simétrica para cifrar o config de sync.
    A chave só pode ser reconstruída por quem tem a api_key original
    (ou acesso ao hash no banco, ou seja: apenas o backend e o próprio edge).
    """
    return hashlib.sha256(f"vision-sync-v1:{api_key_hash}".encode()).digest()


def _encrypt_field(plaintext: str, key: bytes) -> str:
    """Cifra string com AES-GCM. Retorna base64 'nonce|ciphertext|tag'."""
    if not plaintext:
        return ""
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        import os
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)
        ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
        return "aesgcm:" + base64.b64encode(nonce + ct).decode()
    except Exception as e:
        logger.error(f"encrypt_field failed: {e}")
        return ""


class EdgeAuthMixin:
    """Autentica edge device pela API key no header X-Device-Key."""
    throttle_classes = [AnonRateThrottle]  # rate limit por IP, anti-abuse

    def get_device(self, request):
        api_key = request.META.get("HTTP_X_DEVICE_KEY", "")
        return EdgeDevice.authenticate(api_key), api_key

    def _raw_key(self, request):
        return request.META.get("HTTP_X_DEVICE_KEY", "")


# ── Heartbeat ─────────────────────────────────────────────────────────────────

class HeartbeatView(EdgeAuthMixin, APIView):
    permission_classes = []

    def post(self, request):
        device, _ = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        data = request.data if isinstance(request.data, dict) else {}

        def _float(key):
            try:
                v = data.get(key)
                return float(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        def _int(key, default=0):
            try:
                return int(data.get(key, default))
            except (TypeError, ValueError):
                return default

        device.status = "online"
        device.cpu_percent = _float("cpu_percent")
        device.gpu_percent = _float("gpu_percent")
        device.ram_percent = _float("ram_percent")
        device.disk_percent = _float("disk_percent")
        device.cameras_active = _int("cameras_active")
        device.cameras_total = _int("cameras_total")
        device.uptime_seconds = _int("uptime_seconds")
        device.software_version = _truncate(data.get("version", ""), 30)
        device.gpu_model = _truncate(data.get("gpu_model", ""), 100)
        device.cpu_model = _truncate(data.get("cpu_model", ""), 100)
        device.ram_total_gb = _float("ram_total_gb")
        device.disk_total_gb = _float("disk_total_gb")
        device.local_ip = _truncate(data.get("local_ip", ""), 45) or None
        device.ip_address = _client_ip(request) or None
        device.last_heartbeat = timezone.now()
        device.save()

        return Response({"status": "ok", "server_time": timezone.now().isoformat()})


# ── Sync config ───────────────────────────────────────────────────────────────

class SyncConfigView(EdgeAuthMixin, APIView):
    permission_classes = []

    def get(self, request):
        device, raw_key = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        tenant = device.tenant
        cipher_key = _derive_cipher_key(device.api_key_hash)

        # Câmeras — sem N+1: busca objetos e processa em uma passagem.
        # Senha RTSP vai CIFRADA com chave derivada da api_key do device.
        cameras_qs = Camera.objects.filter(tenant=tenant, is_active=True)
        cam_list = []
        for cam in cameras_qs:
            try:
                pwd_plain = cam.get_decrypted_password() if cam.password else ""
            except Exception:
                pwd_plain = ""
            cam_list.append({
                "id": cam.id,
                "name": cam.name,
                "location": cam.location,
                "url": cam.url,
                "protocol": cam.protocol,
                "username": cam.username,
                "password_encrypted": _encrypt_field(pwd_plain, cipher_key),
                "entry_line_y": cam.entry_line_y,
                "location_obj_id": cam.location_obj_id,
            })

        # Regras — prefetch cameras uma vez, sem re-fetchar por regra.
        rules_qs = AlertRule.objects.filter(
            tenant=tenant, is_active=True
        ).prefetch_related("cameras")

        rule_list = []
        for rule in rules_qs:
            rule_list.append({
                "id": rule.id,
                "name": rule.name,
                "behavior": rule.behavior,
                "severity": rule.severity,
                "params": rule.params or {},
                "channels": rule.channels or [],
                "cooldown_seconds": rule.cooldown_seconds,
                "webhook_url": rule.webhook_url,
                "camera_ids": list(rule.cameras.values_list("id", flat=True)),
            })

        # Settings de notificação — também cifradas
        try:
            ts = tenant.settings
            notif = {
                "telegram_token": _encrypt_field(ts.telegram_token or "", cipher_key),
                "telegram_chat_id": ts.telegram_chat_id or "",
                "alert_email": ts.alert_email or "",
                "whatsapp_number": ts.whatsapp_number or "",
            }
        except Exception:
            notif = {}

        device.last_sync = timezone.now()
        device.save(update_fields=["last_sync"])

        return Response({
            "tenant_id": tenant.id,
            "tenant_name": tenant.company_name,
            "tenant_tz": "America/Sao_Paulo",
            "cameras": cam_list,
            "rules": rule_list,
            "notifications": notif,
            "config": {
                "analysis_fps": settings.ANALYSIS_FPS,
                "detection_confidence": settings.DETECTION_CONFIDENCE,
                "yolo_model": settings.YOLO_MODEL,
            },
            "encryption": {
                "scheme": "aesgcm-v1",
                "note": "Campos password_encrypted e telegram_token estão cifrados; derive a chave com sha256('vision-sync-v1:' + sha256(api_key)).",
            }
        })


# ── Report de alerta ──────────────────────────────────────────────────────────

class ReportAlertView(EdgeAuthMixin, APIView):
    permission_classes = []

    def post(self, request):
        device, _ = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        data = request.data
        try:
            rule = AlertRule.objects.get(pk=data["rule_id"], tenant=device.tenant)
            camera = Camera.objects.get(pk=data["camera_id"], tenant=device.tenant)
        except (AlertRule.DoesNotExist, Camera.DoesNotExist):
            return Response({"error": "Rule or camera not found"}, status=404)

        alert = Alert.objects.create(
            rule=rule,
            camera=camera,
            description=_truncate(data.get("description", ""), 500),
            detection_data=data.get("detection_data") or {},
            status="open",
        )

        snapshot_b64 = data.get("snapshot_b64")
        if snapshot_b64:
            try:
                from django.core.files.base import ContentFile
                img_data = base64.b64decode(snapshot_b64)
                if len(img_data) > 5 * 1024 * 1024:
                    logger.warning(f"Snapshot muito grande do device {device.id}, descartado")
                else:
                    alert.snapshot.save(
                        f"alert_{alert.id}.jpg", ContentFile(img_data), save=True
                    )
            except Exception as e:
                logger.warning(f"Snapshot decode falhou: {e}")

        try:
            from apps.core.consumers import broadcast_alert
            broadcast_alert(alert)
        except Exception:
            pass

        try:
            from apps.notifications.tasks import send_alert_notifications
            send_alert_notifications.delay(alert.id)
        except Exception:
            pass

        return Response({"alert_id": alert.id, "status": "created"}, status=201)


# ── Report de métricas ────────────────────────────────────────────────────────

class ReportMetricsView(EdgeAuthMixin, APIView):
    permission_classes = []

    def post(self, request):
        device, _ = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        from apps.cameras.models import CameraMetric
        metrics = request.data.get("metrics", [])
        if not isinstance(metrics, list):
            return Response({"error": "metrics must be list"}, status=400)

        # Limite duro de batch para evitar abuse
        if len(metrics) > 200:
            metrics = metrics[:200]

        created = 0
        for m in metrics:
            try:
                camera = Camera.objects.get(pk=m["camera_id"], tenant=device.tenant)
                CameraMetric.objects.create(
                    camera=camera,
                    metric_type=_truncate(m["metric_type"], 30),
                    value=float(m["value"]),
                )
                created += 1
            except Exception:
                continue

        return Response({"created": created})


# ── Visitor count ─────────────────────────────────────────────────────────────

class ReportVisitorCountView(EdgeAuthMixin, APIView):
    permission_classes = []

    def post(self, request):
        device, _ = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        from apps.locations.models import VisitorCount
        from django.db import models as django_models
        data = request.data

        try:
            camera = Camera.objects.get(pk=data["camera_id"], tenant=device.tenant)
            today = timezone.now().date()
            vc, _ = VisitorCount.objects.get_or_create(
                camera=camera, date=today,
                defaults={"location": camera.location_obj}
            )
            entries = int(data.get("entries", 0))
            exits = int(data.get("exits", 0))
            if entries > 0:
                VisitorCount.objects.filter(pk=vc.pk).update(
                    entries=django_models.F("entries") + entries
                )
            if exits > 0:
                VisitorCount.objects.filter(pk=vc.pk).update(
                    exits=django_models.F("exits") + exits
                )
            return Response({"status": "ok"})
        except Exception as e:
            logger.warning(f"VisitorCount report error: {e}")
            return Response({"error": "invalid payload"}, status=400)


# ── Logs do device ────────────────────────────────────────────────────────────

class DeviceLogView(EdgeAuthMixin, APIView):
    permission_classes = []

    def post(self, request):
        device, _ = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        logs = request.data.get("logs", [])
        if not isinstance(logs, list):
            return Response({"error": "logs must be list"}, status=400)

        to_create = []
        for log in logs[:50]:
            to_create.append(DeviceLog(
                device=device,
                level=_truncate(log.get("level", "info"), 10) or "info",
                message=_truncate(log.get("message", ""), 2000),
            ))
        if to_create:
            DeviceLog.objects.bulk_create(to_create)
        return Response({"saved": len(to_create)})


# ── Registro de device ────────────────────────────────────────────────────────

class RegisterDeviceView(APIView):
    """
    Registra um novo edge device.

    EXIGE o header X-Provision-Token com valor igual a settings.FLEET_PROVISION_TOKEN.
    Se o token não estiver configurado no servidor, o endpoint fica DESABILITADO
    (retorna 403). Nesse caso, use AdminProvisionView (autenticada com JWT de
    superadmin) para criar o device.
    """
    permission_classes = []
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        expected = settings.FLEET_PROVISION_TOKEN
        if not expected:
            return Response(
                {"error": "Registro público desabilitado. Provisionar via painel admin."},
                status=403
            )

        provided = request.headers.get("X-Provision-Token", "")
        # Constant-time compare para evitar timing attack
        import hmac
        if not hmac.compare_digest(expected, provided):
            return Response({"error": "Invalid provision token"}, status=401)

        from apps.tenants.models import Tenant
        try:
            tenant = Tenant.objects.get(pk=request.data.get("tenant_id"))
        except (Tenant.DoesNotExist, ValueError, TypeError):
            return Response({"error": "Tenant not found"}, status=404)

        if not tenant.is_active_or_trial:
            return Response({"error": "Tenant inactive"}, status=403)

        device, raw_key = EdgeDevice.create_with_key(
            tenant=tenant,
            name=_truncate(request.data.get("name", f"Edge-{tenant.company_name}"), 120),
            gpu_model=_truncate(request.data.get("gpu_model", ""), 100),
            cpu_model=_truncate(request.data.get("cpu_model", ""), 100),
            ram_total_gb=request.data.get("ram_total_gb"),
        )

        return Response({
            "device_id": str(device.id),
            "api_key": raw_key,  # única chance de ver
            "message": "Device registrado. Guarde a api_key — não será exibida novamente."
        }, status=201)


# ── Admin endpoints ───────────────────────────────────────────────────────────

class AdminDeviceListView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        devices = EdgeDevice.objects.select_related("tenant").all()
        data = []
        for d in devices:
            data.append({
                "id": str(d.id),
                "name": d.name,
                "api_key_prefix": d.api_key_prefix,  # só o prefixo, nunca a chave
                "tenant_id": d.tenant_id,
                "tenant_name": d.tenant.company_name,
                "status": d.status,
                "is_online": d.is_online,
                "gpu_model": d.gpu_model,
                "cpu_model": d.cpu_model,
                "ram_total_gb": d.ram_total_gb,
                "disk_total_gb": d.disk_total_gb,
                "software_version": d.software_version,
                "cpu_percent": d.cpu_percent,
                "gpu_percent": d.gpu_percent,
                "ram_percent": d.ram_percent,
                "disk_percent": d.disk_percent,
                "cameras_active": d.cameras_active,
                "cameras_total": d.cameras_total,
                "uptime_seconds": d.uptime_seconds,
                "ip_address": d.ip_address,
                "local_ip": d.local_ip,
                "last_heartbeat": d.last_heartbeat.isoformat() if d.last_heartbeat else None,
                "last_sync": d.last_sync.isoformat() if d.last_sync else None,
                "created_at": d.created_at.isoformat(),
            })
        return Response(data)


class AdminDeviceLogsView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request, pk):
        logs = DeviceLog.objects.filter(device_id=pk).order_by("-created_at")[:100]
        data = [{
            "id": l.id,
            "level": l.level,
            "message": l.message,
            "created_at": l.created_at.isoformat(),
        } for l in logs]
        return Response(data)


class AdminProvisionView(APIView):
    """Cria device a partir do painel admin. Retorna a api_key UMA vez."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        from apps.tenants.models import Tenant
        try:
            tenant = Tenant.objects.get(pk=request.data.get("tenant_id"))
        except Tenant.DoesNotExist:
            return Response({"error": "Tenant not found"}, status=404)

        device, raw_key = EdgeDevice.create_with_key(
            tenant=tenant,
            name=_truncate(request.data.get("name", f"Edge-{tenant.company_name}"), 120),
        )

        return Response({
            "device_id": str(device.id),
            "api_key": raw_key,
            "message": "Guarde esta chave — ela não será mostrada novamente.",
        }, status=201)


class AdminRotateKeyView(APIView):
    """Rotaciona a api_key de um device existente."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        import secrets
        try:
            device = EdgeDevice.objects.get(pk=pk)
        except EdgeDevice.DoesNotExist:
            return Response({"error": "Device not found"}, status=404)

        raw_key = secrets.token_hex(32)
        device.api_key_hash = EdgeDevice.hash_key(raw_key)
        device.api_key_prefix = raw_key[:8]
        device.save(update_fields=["api_key_hash", "api_key_prefix"])

        return Response({
            "api_key": raw_key,
            "message": "Chave rotacionada. Atualize o .env do dispositivo.",
        })
