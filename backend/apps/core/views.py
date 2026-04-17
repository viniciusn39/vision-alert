from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from datetime import timedelta
from apps.tenants.permissions import IsTenantMember

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantMember]

    def get(self, request):
        tenant    = request.tenant
        today     = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        from apps.alerts.models import Alert, AlertRule
        from apps.cameras.models import Camera

        return Response({
            "cameras": {
                "total":   Camera.objects.filter(tenant=tenant).count(),
                "online":  Camera.objects.filter(tenant=tenant, status="online").count(),
                "offline": Camera.objects.filter(tenant=tenant, status="offline").count(),
                "alert":   Camera.objects.filter(tenant=tenant, status="alert").count(),
            },
            "alerts": {
                "today":          Alert.objects.filter(rule__tenant=tenant, triggered_at__gte=today).count(),
                "critical_today": Alert.objects.filter(rule__tenant=tenant, triggered_at__gte=today, rule__severity="critical").count(),
                "open":           Alert.objects.filter(rule__tenant=tenant, status="open").count(),
            },
            "rules": {
                "active": AlertRule.objects.filter(tenant=tenant, is_active=True).count(),
                "total":  AlertRule.objects.filter(tenant=tenant).count(),
            },
            "plan": {
                "name":         tenant.plan.display_name,
                "max_cameras":  tenant.plan.max_cameras,
                "max_users":    tenant.plan.max_users,
                "max_rules":    tenant.plan.max_rules,
                "used_cameras": tenant.cameras.count(),
                "used_users":   tenant.users.count(),
                "used_rules":   tenant.alert_rules.count(),
            },
            "tenant": {
                "status":       tenant.status,
                "trial_ends_at":str(tenant.trial_ends_at) if tenant.trial_ends_at else None,
            }
        })


class SystemConfigView(APIView):
    """Leitura e atualização de configurações do sistema — apenas superadmin"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied()
        from .models import SystemConfig
        from django.conf import settings as django_settings
        configs = list(SystemConfig.objects.all().values())
        # Include defaults from settings if not in DB
        defaults = [
            {"key": "ANALYSIS_FPS",          "label": "FPS de análise",          "value": str(django_settings.ANALYSIS_FPS),          "value_type": "float", "description": "Frames por segundo enviados para análise YOLO (0.1 = 1 frame a cada 10s, 1 = 1fps, 2 = 2fps)"},
            {"key": "DETECTION_CONFIDENCE",  "label": "Confiança mínima YOLO",   "value": str(django_settings.DETECTION_CONFIDENCE),  "value_type": "float", "description": "Confiança mínima para considerar uma detecção válida (0.1 a 1.0)"},
            {"key": "YOLO_MODEL",            "label": "Modelo YOLO",             "value": django_settings.YOLO_MODEL,                  "value_type": "str",   "description": "Modelo YOLOv8: yolov8n.pt (rápido), yolov8s.pt (médio), yolov8m.pt (preciso)"},
            {"key": "CELERY_WORKERS",        "label": "Número de workers",       "value": "4",                                         "value_type": "int",   "description": "Quantidade de workers Celery para processar frames em paralelo"},
        ]
        existing_keys = {c["key"] for c in configs}
        for d in defaults:
            if d["key"] not in existing_keys:
                configs.append({**d, "id": None, "updated_at": None})
        return Response(configs)

    def patch(self, request):
        if not request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied()
        from .models import SystemConfig
        updates = request.data  # {key: value, key: value}
        results = []
        for key, value in updates.items():
            obj, _ = SystemConfig.objects.update_or_create(
                key=key,
                defaults={"value": str(value)}
            )
            results.append({"key": obj.key, "value": obj.value})
        return Response({"updated": results})


class SystemMetricsView(APIView):
    """Métricas de performance em tempo real — apenas superadmin"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied()

        import redis as redis_lib
        from django.conf import settings as django_settings
        from django.utils import timezone
        from datetime import timedelta

        metrics = {}

        # Redis / Celery queue sizes
        try:
            r = redis_lib.from_url(django_settings.CELERY_BROKER_URL)
            metrics["queue_cameras"] = r.llen("cameras") or 0
            metrics["queue_default"] = r.llen("default") or 0
            metrics["redis_connected"] = True
        except Exception:
            metrics["queue_cameras"] = 0
            metrics["queue_default"] = 0
            metrics["redis_connected"] = False

        # Camera stats
        from apps.cameras.models import Camera
        metrics["cameras_total"]   = Camera.objects.count()
        metrics["cameras_online"]  = Camera.objects.filter(status="online").count()
        metrics["cameras_offline"] = Camera.objects.filter(status="offline").count()
        metrics["cameras_active"]  = Camera.objects.filter(is_active=True).count()

        # Alert throughput (last hour / last 24h)
        from apps.alerts.models import Alert
        now   = timezone.now()
        hour  = now - timedelta(hours=1)
        day   = now - timedelta(hours=24)
        metrics["alerts_last_hour"] = Alert.objects.filter(triggered_at__gte=hour).count()
        metrics["alerts_last_24h"]  = Alert.objects.filter(triggered_at__gte=day).count()
        metrics["alerts_open"]      = Alert.objects.filter(status="open").count()
        metrics["alerts_total"]     = Alert.objects.count()

        # Alerts per camera (top 5)
        from django.db.models import Count
        top_cams = (Alert.objects
                    .filter(triggered_at__gte=day)
                    .values("camera__name", "camera_id")
                    .annotate(count=Count("id"))
                    .order_by("-count")[:5])
        metrics["top_cameras"] = list(top_cams)

        # Alerts by severity last 24h
        by_sev = (Alert.objects
                  .filter(triggered_at__gte=day)
                  .values("rule__severity")
                  .annotate(count=Count("id")))
        metrics["alerts_by_severity"] = {s["rule__severity"]: s["count"] for s in by_sev}

        # Alerts by hour (last 12h)
        from django.db.models.functions import TruncHour
        by_hour = (Alert.objects
                   .filter(triggered_at__gte=now - timedelta(hours=12))
                   .annotate(hour=TruncHour("triggered_at"))
                   .values("hour")
                   .annotate(count=Count("id"))
                   .order_by("hour"))
        metrics["alerts_by_hour"] = [
            {"hour": h["hour"].strftime("%H:%M"), "count": h["count"]}
            for h in by_hour
        ]

        # Tenants summary
        from apps.tenants.models import Tenant
        metrics["tenants_total"]  = Tenant.objects.count()
        metrics["tenants_active"] = Tenant.objects.filter(status="active").count()

        # System config
        from .models import SystemConfig
        metrics["analysis_fps"]    = SystemConfig.get("ANALYSIS_FPS", django_settings.ANALYSIS_FPS)
        metrics["detection_conf"]  = SystemConfig.get("DETECTION_CONFIDENCE", django_settings.DETECTION_CONFIDENCE)
        metrics["yolo_model"]      = SystemConfig.get("YOLO_MODEL", django_settings.YOLO_MODEL)

        # Processing rate estimate
        fps = float(metrics["analysis_fps"] or 1)
        active = int(metrics["cameras_active"] or 0)
        metrics["frames_per_second"] = round(fps * active, 2)
        metrics["frames_per_minute"] = round(fps * active * 60, 0)

        # System resources via psutil
        try:
            import psutil
            # CPU
            metrics["cpu_percent"]      = psutil.cpu_percent(interval=0.5)
            metrics["cpu_count"]        = psutil.cpu_count()
            metrics["cpu_per_core"]     = psutil.cpu_percent(interval=0.1, percpu=True)

            # Memory
            mem = psutil.virtual_memory()
            metrics["mem_total_gb"]     = round(mem.total / 1024**3, 1)
            metrics["mem_used_gb"]      = round(mem.used / 1024**3, 1)
            metrics["mem_available_gb"] = round(mem.available / 1024**3, 1)
            metrics["mem_percent"]      = mem.percent

            # Disk
            disk = psutil.disk_usage("/")
            metrics["disk_total_gb"]    = round(disk.total / 1024**3, 1)
            metrics["disk_used_gb"]     = round(disk.used / 1024**3, 1)
            metrics["disk_percent"]     = disk.percent

            # Network I/O (delta since boot - indicativo)
            net = psutil.net_io_counters()
            metrics["net_sent_mb"]      = round(net.bytes_sent / 1024**2, 1)
            metrics["net_recv_mb"]      = round(net.bytes_recv / 1024**2, 1)

            # Process info (current Django process)
            proc = psutil.Process()
            metrics["proc_cpu"]         = round(proc.cpu_percent(interval=0.1), 1)
            metrics["proc_mem_mb"]      = round(proc.memory_info().rss / 1024**2, 1)
            metrics["proc_threads"]     = proc.num_threads()

            # Uptime
            import time
            metrics["uptime_seconds"]   = int(time.time() - psutil.boot_time())
            hours, rem = divmod(metrics["uptime_seconds"], 3600)
            minutes, _ = divmod(rem, 60)
            metrics["uptime_str"]       = f"{hours}h {minutes}min"

        except Exception as e:
            metrics["psutil_error"] = str(e)

        return Response(metrics)
