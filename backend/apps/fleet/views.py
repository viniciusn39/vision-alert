from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from .models import EdgeDevice, DeviceLog
from apps.alerts.models import Alert, AlertRule
from apps.cameras.models import Camera


class EdgeAuthMixin:
    """Authenticate edge device by API key in header."""

    def get_device(self, request):
        api_key = request.META.get("HTTP_X_DEVICE_KEY", "")
        if not api_key:
            return None
        try:
            return EdgeDevice.objects.select_related("tenant").get(api_key=api_key)
        except EdgeDevice.DoesNotExist:
            return None


class HeartbeatView(EdgeAuthMixin, APIView):
    """Edge device sends heartbeat every 60s with health metrics."""
    permission_classes = []

    def post(self, request):
        device = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        data = request.data
        device.status = "online"
        device.cpu_percent = data.get("cpu_percent")
        device.gpu_percent = data.get("gpu_percent")
        device.ram_percent = data.get("ram_percent")
        device.disk_percent = data.get("disk_percent")
        device.cameras_active = data.get("cameras_active", 0)
        device.cameras_total = data.get("cameras_total", 0)
        device.uptime_seconds = data.get("uptime_seconds", 0)
        device.software_version = data.get("version", "")
        device.gpu_model = data.get("gpu_model", "")
        device.cpu_model = data.get("cpu_model", "")
        device.ram_total_gb = data.get("ram_total_gb")
        device.disk_total_gb = data.get("disk_total_gb")
        device.local_ip = data.get("local_ip", "")
        device.ip_address = request.META.get("REMOTE_ADDR", "")
        device.last_heartbeat = timezone.now()
        device.save()

        return Response({"status": "ok", "server_time": timezone.now().isoformat()})


class SyncConfigView(EdgeAuthMixin, APIView):
    """Edge device pulls its configuration (cameras + rules)."""
    permission_classes = []

    def get(self, request):
        device = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        tenant = device.tenant

        # Cameras for this tenant
        cameras = Camera.objects.filter(tenant=tenant, is_active=True).values(
            "id", "name", "location", "url", "protocol",
            "username", "entry_line_y", "location_obj_id"
        )
        # Decrypt passwords separately (don't expose encrypted value)
        cam_list = []
        for cam_data in cameras:
            cam_obj = Camera.objects.get(pk=cam_data["id"])
            cam_data["password"] = cam_obj.get_decrypted_password()
            cam_list.append(cam_data)

        # Alert rules
        rules = AlertRule.objects.filter(tenant=tenant, is_active=True).values(
            "id", "name", "behavior", "severity", "params",
            "channels", "cooldown_seconds", "webhook_url"
        )
        rule_list = []
        for rule in rules:
            rule_cameras = list(
                AlertRule.objects.get(pk=rule["id"]).cameras.values_list("id", flat=True)
            )
            rule["camera_ids"] = rule_cameras
            rule_list.append(rule)

        # Tenant settings (for notifications)
        try:
            settings = tenant.settings
            notif = {
                "telegram_token": settings.telegram_token,
                "telegram_chat_id": settings.telegram_chat_id,
                "alert_email": settings.alert_email,
                "whatsapp_number": settings.whatsapp_number,
            }
        except Exception:
            notif = {}

        device.last_sync = timezone.now()
        device.save(update_fields=["last_sync"])

        return Response({
            "tenant_id": tenant.id,
            "tenant_name": tenant.company_name,
            "cameras": cam_list,
            "rules": rule_list,
            "notifications": notif,
            "config": {
                "analysis_fps": 2,
                "detection_confidence": 0.45,
                "yolo_model": "yolov8n.pt",
            }
        })


class ReportAlertView(EdgeAuthMixin, APIView):
    """Edge device reports a triggered alert."""
    permission_classes = []

    def post(self, request):
        device = self.get_device(request)
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
            description=data.get("description", ""),
            detection_data=data.get("detection_data", {}),
            status="open",
        )

        # Save snapshot if provided (base64 JPEG)
        snapshot_b64 = data.get("snapshot_b64")
        if snapshot_b64:
            import base64
            from django.core.files.base import ContentFile
            img_data = base64.b64decode(snapshot_b64)
            alert.snapshot.save(
                f"alert_{alert.id}.jpg",
                ContentFile(img_data),
                save=True
            )

        # Broadcast via WebSocket
        try:
            from apps.core.consumers import broadcast_alert
            broadcast_alert(alert)
        except Exception:
            pass

        # Send notifications
        try:
            from apps.notifications.tasks import send_alert_notifications
            send_alert_notifications(alert.id)
        except Exception:
            pass

        return Response({"alert_id": alert.id, "status": "created"}, status=201)


class ReportMetricsView(EdgeAuthMixin, APIView):
    """Edge device reports camera metrics (people count, queue, etc)."""
    permission_classes = []

    def post(self, request):
        device = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        from apps.cameras.models import CameraMetric
        metrics = request.data.get("metrics", [])
        created = 0

        for m in metrics:
            try:
                camera = Camera.objects.get(pk=m["camera_id"], tenant=device.tenant)
                CameraMetric.objects.create(
                    camera=camera,
                    metric_type=m["metric_type"],
                    value=m["value"],
                )
                created += 1
            except Exception:
                continue

        return Response({"created": created})


class ReportVisitorCountView(EdgeAuthMixin, APIView):
    """Edge device reports visitor counting data."""
    permission_classes = []

    def post(self, request):
        device = self.get_device(request)
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
            if data.get("entries", 0) > 0:
                VisitorCount.objects.filter(pk=vc.pk).update(
                    entries=django_models.F("entries") + data["entries"]
                )
            if data.get("exits", 0) > 0:
                VisitorCount.objects.filter(pk=vc.pk).update(
                    exits=django_models.F("exits") + data["exits"]
                )
            return Response({"status": "ok"})
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class DeviceLogView(EdgeAuthMixin, APIView):
    """Edge device sends log entries."""
    permission_classes = []

    def post(self, request):
        device = self.get_device(request)
        if not device:
            return Response({"error": "Invalid API key"}, status=401)

        logs = request.data.get("logs", [])
        for log in logs[:50]:
            DeviceLog.objects.create(
                device=device,
                level=log.get("level", "info"),
                message=log.get("message", ""),
            )
        return Response({"saved": min(len(logs), 50)})


class RegisterDeviceView(APIView):
    """Register a new edge device (called during setup)."""
    permission_classes = []

    def post(self, request):
        setup_token = request.data.get("setup_token", "")
        # Setup token = tenant API key created during provisioning
        from apps.tenants.models import Tenant
        try:
            tenant = Tenant.objects.get(pk=request.data.get("tenant_id"))
        except Tenant.DoesNotExist:
            return Response({"error": "Tenant not found"}, status=404)

        api_key = EdgeDevice.generate_api_key()
        device = EdgeDevice.objects.create(
            tenant=tenant,
            name=request.data.get("name", f"Edge-{tenant.company_name}"),
            api_key=api_key,
            gpu_model=request.data.get("gpu_model", ""),
            cpu_model=request.data.get("cpu_model", ""),
            ram_total_gb=request.data.get("ram_total_gb"),
        )

        return Response({
            "device_id": str(device.id),
            "api_key": api_key,
            "message": "Device registered. Save the API key — it won't be shown again."
        }, status=201)


# ── Admin endpoints (require superadmin JWT) ─────────────────────────────────

from rest_framework.permissions import IsAuthenticated
from apps.tenants.permissions import IsSuperAdmin


class AdminDeviceListView(APIView):
    """List all edge devices for admin dashboard."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        devices = EdgeDevice.objects.select_related("tenant").all()
        data = []
        for d in devices:
            data.append({
                "id": str(d.id),
                "name": d.name,
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
    """Get logs for a specific device."""
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
    """Provision a new edge device from admin panel."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        from apps.tenants.models import Tenant
        try:
            tenant = Tenant.objects.get(pk=request.data.get("tenant_id"))
        except Tenant.DoesNotExist:
            return Response({"error": "Tenant not found"}, status=404)

        api_key = EdgeDevice.generate_api_key()
        device = EdgeDevice.objects.create(
            tenant=tenant,
            name=request.data.get("name", f"Edge-{tenant.company_name}"),
            api_key=api_key,
        )

        return Response({
            "device_id": str(device.id),
            "api_key": api_key,
        }, status=201)
