from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from django_filters.rest_framework import DjangoFilterBackend

import os
import uuid
import logging

logger = logging.getLogger(__name__)


class NoPagination(PageNumberPagination):
    page_size = None


from apps.tenants.permissions import IsTenantMember, IsTenantAdmin
from .models import Camera, CameraZone, TenantQuerysetMixin
from .serializers import CameraSerializer, CameraListSerializer, CameraZoneSerializer


class CameraViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = Camera.objects.all()
    permission_classes = [IsAuthenticated, IsTenantMember]
    pagination_class = NoPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "is_active", "protocol"]

    def get_serializer_class(self):
        return CameraListSerializer if self.action == "list" else CameraSerializer

    def perform_create(self, serializer):
        from django.db import transaction
        from rest_framework.exceptions import PermissionDenied
        tenant = self.request.tenant
        plan = tenant.plan
        # select_for_update evita race condition no limite do plano
        with transaction.atomic():
            current = tenant.cameras.select_for_update().count()
            if current >= plan.max_cameras:
                raise PermissionDenied(f"Limite de câmeras do plano atingido ({plan.max_cameras}).")
            serializer.save(tenant=tenant, is_active=False, status="offline")

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        cam = self.get_object()
        cam.is_active = True
        cam.save(update_fields=["is_active"])
        from .tasks import start_camera_processing
        start_camera_processing.delay(cam.id)
        return Response({"status": "started"})

    @action(detail=True, methods=["post"])
    def stop(self, request, pk=None):
        cam = self.get_object()
        cam.is_active = False
        cam.status = "offline"
        cam.save(update_fields=["is_active", "status"])
        return Response({"status": "stopped"})

    @action(detail=True, methods=["post"], url_path="stream-token")
    def stream_token(self, request, pk=None):
        """Gera token curto (60s) para abrir o stream MJPEG via <img>."""
        cam = self.get_object()
        from .stream_token import issue, TOKEN_TTL_SECONDS
        token = issue(user_id=request.user.id, camera_id=cam.id)
        return Response({"token": token, "expires_in": TOKEN_TTL_SECONDS})


class CameraZoneViewSet(viewsets.ModelViewSet):
    queryset = CameraZone.objects.all()
    serializer_class = CameraZoneSerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["camera"]

    def get_queryset(self):
        return CameraZone.objects.filter(camera__tenant=self.request.tenant)


# ── Upload de vídeo ───────────────────────────────────────────────────────────

class VideoUploadView(APIView):
    permission_classes = [IsAuthenticated, IsTenantMember]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "Nenhum arquivo enviado."}, status=400)

        allowed = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in allowed:
            return Response(
                {"detail": f"Formato não suportado. Use: {', '.join(sorted(allowed))}"},
                status=400
            )

        if file.size > 500 * 1024 * 1024:
            return Response({"detail": "Arquivo muito grande. Máximo 500MB."}, status=400)

        tenant_id = request.tenant.id
        upload_dir = os.path.join("/tmp/camera_uploads", f"tenant_{tenant_id}")
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(upload_dir, filename)

        with open(path, "wb") as f:
            for chunk in file.chunks():
                f.write(chunk)

        return Response({"path": path, "filename": file.name, "size": file.size})


class YouTubeDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsTenantMember]

    def post(self, request):
        url = (request.data.get("url") or "").strip()

        # Validação robusta: urlparse + whitelist + rejeição de caracteres shell
        from urllib.parse import urlparse
        try:
            parsed = urlparse(url)
        except Exception:
            return Response({"detail": "URL inválida."}, status=400)

        if parsed.scheme not in {"http", "https"}:
            return Response({"detail": "URL deve ser http(s)."}, status=400)

        host = (parsed.hostname or "").lower()
        if host not in {"www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"}:
            return Response({"detail": "Apenas URLs do YouTube são aceitas."}, status=400)

        if any(c in url for c in ["\n", "\r", "\t", "`", "$", ";", "|", "&&"]):
            return Response({"detail": "URL com caracteres suspeitos."}, status=400)

        import subprocess
        import shutil
        if not shutil.which("yt-dlp"):
            return Response({"detail": "yt-dlp não instalado no servidor."}, status=500)

        tenant_id = request.tenant.id
        upload_dir = os.path.join("/tmp/camera_uploads", f"tenant_{tenant_id}")
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.mp4"
        path = os.path.join(upload_dir, filename)

        try:
            # '--' encerra parsing de flags; url vem como argumento puro.
            result = subprocess.run(
                ["yt-dlp", "-f", "best[height<=480]", "-o", path, "--no-playlist", "--", url],
                capture_output=True, text=True, timeout=120
            )
            if result.returncode != 0:
                return Response({"detail": f"Erro ao baixar: {result.stderr[-300:]}"}, status=400)
            if not os.path.exists(path):
                return Response({"detail": "Arquivo não foi gerado."}, status=400)
            size = os.path.getsize(path)
            return Response({"path": path, "filename": filename, "size": size})
        except subprocess.TimeoutExpired:
            return Response({"detail": "Timeout ao baixar o vídeo (máx 2 min)."}, status=400)
        except Exception as e:
            logger.exception("YouTube download error")
            return Response({"detail": str(e)}, status=500)


class CameraDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantMember]

    def get(self, request, pk):
        from apps.tenants.permissions import get_tenant
        tenant = get_tenant(request)
        try:
            cam = Camera.objects.get(pk=pk, tenant=tenant)
        except Camera.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound()

        from apps.alerts.models import AlertRule, Alert
        from .models import CameraMetric

        rules = AlertRule.objects.filter(tenant=tenant, is_active=True).filter(
            cameras__id=pk
        ).values("id", "name", "behavior", "severity", "cooldown_seconds", "is_active")

        alerts = Alert.objects.filter(camera=cam).order_by("-triggered_at")[:20].values(
            "id", "description", "triggered_at", "status", "rule__name", "rule__severity"
        )

        from django.utils import timezone
        from datetime import timedelta
        since = timezone.now() - timedelta(hours=24)
        metrics = CameraMetric.objects.filter(camera=cam, timestamp__gte=since)

        by_type = {}
        for mtype in ["people_count", "queue_size", "vehicle_count", "motion_score"]:
            rows = list(metrics.filter(metric_type=mtype).values("timestamp", "value"))
            if rows:
                vals = [r["value"] for r in rows]
                by_type[mtype] = {
                    "values": [{"ts": r["timestamp"].strftime("%H:%M"), "v": r["value"]} for r in rows[:50]],
                    "avg": round(sum(vals) / len(vals), 1),
                    "max": max(vals),
                    "count": len(vals),
                }

        return Response({
            "camera": {
                "id": cam.id, "name": cam.name, "location": cam.location,
                "protocol": cam.protocol, "status": cam.status,
                "is_active": cam.is_active, "last_seen": cam.last_seen,
            },
            "rules": list(rules),
            "recent_alerts": list(alerts),
            "metrics": by_type,
        })


# ── Stream MJPEG ao vivo ──────────────────────────────────────────────────────

# Modelo YOLO cacheado por processo (evita carregar ~200MB por conexão)
_stream_yolo_model = None


def _get_stream_yolo():
    global _stream_yolo_model
    if _stream_yolo_model is None:
        os.environ["YOLO_VERBOSE"] = "false"
        try:
            from ultralytics import YOLO
            from ultralytics import settings as ul_settings
            ul_settings.update({
                "sync": False, "clearml": False, "comet": False, "dvc": False,
                "mlflow": False, "neptune": False, "raytune": False,
                "tensorboard": False, "wandb": False
            })
            from django.conf import settings as ds
            _stream_yolo_model = YOLO(ds.YOLO_MODEL)
            logger.info("YOLO cacheado para streams ao vivo")
        except Exception as e:
            logger.warning(f"YOLO load falhou: {e}")
            _stream_yolo_model = False  # sentinel — não tenta de novo
    return _stream_yolo_model or None


from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt


@method_decorator(csrf_exempt, name="dispatch")
class CameraLiveStreamView(View):
    """
    Stream MJPEG com overlay YOLO.
    Autenticação via stream-token curto (?st=...), NÃO via JWT de sessão.
    Aplica limite por usuário e global via cache Redis.
    """

    async def get(self, request, pk):
        import asyncio
        import base64
        import json
        from django.http import HttpResponse, StreamingHttpResponse
        from asgiref.sync import sync_to_async
        from django.contrib.auth import get_user_model
        from django.core.cache import cache
        from django.conf import settings as ds
        from .stream_token import verify

        # 1. Stream token
        st = request.GET.get("st", "")
        if not st:
            return HttpResponse("Missing stream token", status=401)

        try:
            body_b64 = st.split(".", 1)[0]
            pad = "=" * (-len(body_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(body_b64 + pad))
            claimed_user = int(payload["u"])
            claimed_cam = int(payload["c"])
        except Exception:
            return HttpResponse("Malformed stream token", status=401)

        if claimed_cam != int(pk):
            return HttpResponse("Token/camera mismatch", status=401)

        if not verify(st, claimed_user, claimed_cam):
            return HttpResponse("Invalid or expired stream token", status=401)

        # 2. Usuário + câmera do tenant correto
        User = get_user_model()
        try:
            user = await sync_to_async(
                lambda: User.objects.select_related("tenant").get(pk=claimed_user)
            )()
        except User.DoesNotExist:
            return HttpResponse("User not found", status=401)

        try:
            cam = await sync_to_async(
                lambda: Camera.objects.get(pk=pk, tenant=user.tenant)
            )()
        except Camera.DoesNotExist:
            return HttpResponse("Camera not found", status=404)

        # 3. Limites de conexão
        user_key = f"stream:user:{user.id}"
        global_key = "stream:global"

        def _incr(key, limit, ttl=3600):
            current = cache.get(key, 0)
            if current >= limit:
                return False
            cache.set(key, current + 1, ttl)
            return True

        def _decr(key):
            current = cache.get(key, 0)
            if current > 0:
                cache.set(key, current - 1, 3600)

        ok_u = await sync_to_async(_incr)(user_key, ds.LIVE_STREAM_MAX_PER_USER)
        if not ok_u:
            return HttpResponse(
                f"Limite de streams simultâneos por usuário ({ds.LIVE_STREAM_MAX_PER_USER}) atingido",
                status=429
            )
        ok_g = await sync_to_async(_incr)(global_key, ds.LIVE_STREAM_MAX_GLOBAL)
        if not ok_g:
            await sync_to_async(_decr)(user_key)
            return HttpResponse("Servidor sobrecarregado — tente em alguns segundos", status=429)

        # 4. Stream
        import queue
        import threading
        import cv2
        import time
        import numpy as np
        from collections import deque

        frame_queue = queue.Queue(maxsize=15)
        stop_event = threading.Event()
        BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        TAIL = b"\r\n"

        entry_line_y = await sync_to_async(lambda: cam.entry_line_y)()
        stream_url = await sync_to_async(lambda: cam.get_stream_url())()
        cam_name = await sync_to_async(lambda: cam.name)()

        def producer():
            COLORS = {
                "person": (0, 255, 0), "car": (255, 128, 0), "truck": (255, 64, 0),
                "motorcycle": (255, 200, 0), "bicycle": (100, 255, 100),
                "backpack": (255, 0, 255), "handbag": (200, 0, 255),
            }

            cap = cv2.VideoCapture(stream_url)

            if not cap.isOpened():
                img = np.zeros((360, 640, 3), dtype=np.uint8)
                cv2.putText(img, "Camera offline", (160, 180),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                _, buf = cv2.imencode(".jpg", img)
                try:
                    frame_queue.put(BOUNDARY + buf.tobytes() + TAIL, timeout=2)
                except queue.Full:
                    pass
                frame_queue.put(None)
                return

            model = _get_stream_yolo()  # cacheado por processo

            YOLO_EVERY = 5
            BUFFER_SIZE = 10
            cached_boxes = []
            video_fps = cap.get(cv2.CAP_PROP_FPS) or 25
            target_fps = min(video_fps, 15)
            frame_delay = 1.0 / target_fps
            count = 0
            buffer = deque()
            start_ts = time.time()
            max_secs = ds.LIVE_STREAM_MAX_SECONDS

            def process_frame():
                nonlocal count, cached_boxes
                if stop_event.is_set():
                    return None
                ret, frame = cap.read()
                if not ret:
                    return None
                count += 1
                h, w = frame.shape[:2]
                if w > 640:
                    frame = cv2.resize(frame, (640, int(h * 640 / w)))
                h, w = frame.shape[:2]

                if entry_line_y:
                    ly = int(float(entry_line_y) * h)
                    cv2.line(frame, (0, ly), (w, ly), (0, 255, 255), 2)
                    cv2.putText(frame, "ENTRADA", (10, ly - 6),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

                if model and count % YOLO_EVERY == 1:
                    try:
                        results = model.track(frame, persist=True, verbose=False,
                                              conf=0.45, imgsz=320)
                        cached_boxes = []
                        for r in results:
                            if r.boxes is None:
                                continue
                            for box in r.boxes:
                                cls_name = r.names[int(box.cls)]
                                conf = float(box.conf)
                                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                                tid = int(box.id) if box.id is not None else 0
                                color = COLORS.get(cls_name, (0, 200, 255))
                                cached_boxes.append((x1, y1, x2, y2, cls_name, conf, tid, color))
                    except Exception:
                        pass

                for x1, y1, x2, y2, cls_name, conf, tid, color in cached_boxes:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    label = f"{cls_name} {conf:.0%} #{tid}"
                    (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
                    cv2.rectangle(frame, (x1, y1 - lh - 8), (x1 + lw + 4, y1), color, -1)
                    cv2.putText(frame, label, (x1 + 2, y1 - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 1)

                cv2.putText(frame, f"{cam_name}  {time.strftime('%H:%M:%S')}",
                            (6, h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)

                _, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                return BOUNDARY + jpg.tobytes() + TAIL

            try:
                for _ in range(BUFFER_SIZE):
                    if stop_event.is_set():
                        break
                    data = process_frame()
                    if data is None:
                        break
                    buffer.append(data)

                while not stop_event.is_set() and (time.time() - start_ts) < max_secs:
                    t0 = time.time()
                    data = process_frame()
                    if data is None:
                        break
                    buffer.append(data)

                    if buffer:
                        emit = buffer.popleft()
                        try:
                            frame_queue.put(emit, timeout=1)
                        except queue.Full:
                            pass

                    elapsed = time.time() - t0
                    if elapsed < frame_delay:
                        time.sleep(frame_delay - elapsed)

                while buffer and not stop_event.is_set():
                    emit = buffer.popleft()
                    try:
                        frame_queue.put(emit, timeout=1)
                    except queue.Full:
                        pass

            except Exception as e:
                logger.error(f"Producer crashed: {e}")
            finally:
                cap.release()
                try:
                    frame_queue.put(None, timeout=1)
                except queue.Full:
                    pass

        t = threading.Thread(target=producer, daemon=True)
        t.start()

        async def async_consumer():
            loop = asyncio.get_event_loop()
            try:
                while True:
                    try:
                        item = await asyncio.wait_for(
                            loop.run_in_executor(None, frame_queue.get),
                            timeout=30
                        )
                    except asyncio.TimeoutError:
                        break
                    if item is None:
                        break
                    yield item
            finally:
                # Garantir parada + liberação de contadores em qualquer caso
                stop_event.set()
                await sync_to_async(_decr)(user_key)
                await sync_to_async(_decr)(global_key)

        return StreamingHttpResponse(
            async_consumer(),
            content_type="multipart/x-mixed-replace; boundary=frame"
        )
