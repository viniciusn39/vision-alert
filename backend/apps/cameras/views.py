from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend

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
    filterset_fields = ["status","is_active","protocol"]

    def get_serializer_class(self):
        return CameraListSerializer if self.action == "list" else CameraSerializer

    def perform_create(self, serializer):
        tenant = self.request.tenant
        plan   = tenant.plan
        if tenant.cameras.count() >= plan.max_cameras:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(f"Limite de câmeras do plano atingido ({plan.max_cameras}).")
        serializer.save(tenant=tenant)

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
        cam.status    = "offline"
        cam.save(update_fields=["is_active","status"])
        return Response({"status": "stopped"})

class CameraZoneViewSet(viewsets.ModelViewSet):
    queryset = CameraZone.objects.all()
    serializer_class = CameraZoneSerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["camera"]

    def get_queryset(self):
        return CameraZone.objects.filter(camera__tenant=self.request.tenant)


# ── Video Upload ──────────────────────────────────────────────────────────────
import os, uuid
from rest_framework.views import APIView
from django.views import View
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from django.conf import settings

class VideoUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "Nenhum arquivo enviado."}, status=400)

        # Only allow video files
        allowed = [".mp4", ".avi", ".mov", ".mkv", ".webm"]
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in allowed:
            return Response({"detail": f"Formato não suportado. Use: {', '.join(allowed)}"}, status=400)

        # Max 500MB
        if file.size > 500 * 1024 * 1024:
            return Response({"detail": "Arquivo muito grande. Máximo 500MB."}, status=400)

        # Save to /tmp/uploads/
        upload_dir = "/tmp/camera_uploads"
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(upload_dir, filename)

        with open(path, "wb") as f:
            for chunk in file.chunks():
                f.write(chunk)

        return Response({"path": path, "filename": file.name, "size": file.size})

class YouTubeDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        url = request.data.get("url", "").strip()
        if not url or ("youtube.com" not in url and "youtu.be" not in url):
            return Response({"detail": "URL do YouTube inválida."}, status=400)

        import subprocess, shutil
        if not shutil.which("yt-dlp"):
            return Response({"detail": "yt-dlp não instalado no servidor."}, status=500)

        upload_dir = "/tmp/camera_uploads"
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.mp4"
        path = os.path.join(upload_dir, filename)

        try:
            result = subprocess.run(
                ["yt-dlp", "-f", "best[height<=480]", "-o", path, "--no-playlist", url],
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
            return Response({"detail": str(e)}, status=500)


class CameraDetailView(APIView):
    """Detailed view: rules + metrics for a single camera"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.tenants.permissions import get_tenant
        tenant = get_tenant(request)
        try:
            from .models import Camera, CameraMetric
            cam = Camera.objects.get(pk=pk, tenant=tenant)
        except Camera.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound()

        # Rules applied to this camera
        from apps.alerts.models import AlertRule, Alert
        rules = AlertRule.objects.filter(tenant=tenant, is_active=True).filter(
            cameras__id=pk
        ).values("id","name","behavior","severity","cooldown_seconds","is_active")

        # Recent alerts
        alerts = Alert.objects.filter(camera=cam).order_by("-triggered_at")[:20].values(
            "id","description","triggered_at","status","rule__name","rule__severity"
        )

        # Metrics last 24h
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Avg, Max, Count
        since = timezone.now() - timedelta(hours=24)
        metrics = CameraMetric.objects.filter(camera=cam, timestamp__gte=since)

        by_type = {}
        for mtype in ["people_count","queue_size","vehicle_count","motion_score"]:
            rows = metrics.filter(metric_type=mtype).values("timestamp","value")
            if rows:
                vals = [r["value"] for r in rows]
                by_type[mtype] = {
                    "values": [{"ts": r["timestamp"].strftime("%H:%M"), "v": r["value"]} for r in rows[:50]],
                    "avg": round(sum(vals)/len(vals), 1),
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


from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

@method_decorator(csrf_exempt, name='dispatch')
class CameraLiveStreamView(View):
    """MJPEG stream with YOLO overlay — async streaming for Daphne/ASGI"""

    async def get(self, request, pk):
        import asyncio
        from rest_framework_simplejwt.tokens import AccessToken
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
        from django.http import HttpResponse, StreamingHttpResponse
        from django.contrib.auth import get_user_model
        from asgiref.sync import sync_to_async

        token = request.GET.get("token", "")
        if not token:
            return HttpResponse("Unauthorized", status=401)
        try:
            access = AccessToken(token)
            User = get_user_model()
            user = await sync_to_async(
                lambda: User.objects.select_related("tenant").get(pk=access["user_id"])
            )()
        except (InvalidToken, TokenError, Exception):
            return HttpResponse("Unauthorized", status=401)
        try:
            from .models import Camera
            cam = await sync_to_async(Camera.objects.get)(pk=pk, tenant=user.tenant)
        except Camera.DoesNotExist:
            return HttpResponse("Not found", status=404)

        import queue, threading, cv2, time, numpy as np
        from django.conf import settings as ds

        frame_queue = queue.Queue(maxsize=15)
        BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        TAIL     = b"\r\n"

        entry_line_y = await sync_to_async(lambda: cam.entry_line_y)()
        stream_url = await sync_to_async(lambda: cam.get_stream_url())()
        cam_name = await sync_to_async(lambda: cam.name)()

        def producer():
            import logging
            from collections import deque
            log = logging.getLogger("stream")
            COLORS = {
                "person": (0,255,0), "car": (255,128,0), "truck": (255,64,0),
                "motorcycle": (255,200,0), "bicycle": (100,255,100),
                "backpack": (255,0,255), "handbag": (200,0,255),
            }

            cap = cv2.VideoCapture(stream_url)

            if not cap.isOpened():
                img = np.zeros((360,640,3), dtype=np.uint8)
                cv2.putText(img, "Camera offline", (160,180),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)
                _, buf = cv2.imencode(".jpg", img)
                try:
                    frame_queue.put(BOUNDARY + buf.tobytes() + TAIL, timeout=2)
                except queue.Full:
                    pass
                frame_queue.put(None)
                return

            try:
                import os
                os.environ["YOLO_VERBOSE"] = "false"
                from ultralytics import YOLO
                from ultralytics import settings as ul_settings
                ul_settings.update({"sync": False})
                model = YOLO(ds.YOLO_MODEL)
            except Exception as e:
                log.warning(f"YOLO load failed: {e}")
                model = None

            YOLO_EVERY = 5
            BUFFER_SIZE = 10
            cached_boxes = []
            video_fps = cap.get(cv2.CAP_PROP_FPS) or 25
            target_fps = min(video_fps, 15)
            frame_delay = 1.0 / target_fps
            count = 0
            buffer = deque()

            def process_frame():
                nonlocal count, cached_boxes
                ret, frame = cap.read()
                if not ret:
                    return None
                count += 1
                h, w = frame.shape[:2]
                if w > 640:
                    frame = cv2.resize(frame, (640, int(h*640/w)))
                h, w = frame.shape[:2]

                if entry_line_y:
                    ly = int(float(entry_line_y) * h)
                    cv2.line(frame, (0,ly), (w,ly), (0,255,255), 2)
                    cv2.putText(frame, "ENTRADA", (10, ly-6),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,255,255), 1)

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
                                x1,y1,x2,y2 = [int(v) for v in box.xyxy[0].tolist()]
                                tid = int(box.id) if box.id is not None else 0
                                color = COLORS.get(cls_name, (0,200,255))
                                cached_boxes.append((x1,y1,x2,y2,cls_name,conf,tid,color))
                    except Exception:
                        pass

                for x1,y1,x2,y2,cls_name,conf,tid,color in cached_boxes:
                    cv2.rectangle(frame, (x1,y1), (x2,y2), color, 2)
                    label = f"{cls_name} {conf:.0%} #{tid}"
                    (lw,lh),_ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
                    cv2.rectangle(frame, (x1,y1-lh-8), (x1+lw+4,y1), color, -1)
                    cv2.putText(frame, label, (x1+2,y1-4),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0,0,0), 1)

                cv2.putText(frame, f"{cam_name}  {time.strftime('%H:%M:%S')}",
                           (6,h-8), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180,180,180), 1)

                _, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                return BOUNDARY + jpg.tobytes() + TAIL

            try:
                # Phase 1: pre-fill buffer (absorbs initial YOLO load time)
                for _ in range(BUFFER_SIZE):
                    data = process_frame()
                    if data is None:
                        break
                    buffer.append(data)

                # Phase 2: steady emission — read one, emit one, pace to FPS
                while count < 7200:
                    t0 = time.time()

                    # Read and process next frame into buffer
                    data = process_frame()
                    if data is None:
                        break
                    buffer.append(data)

                    # Emit oldest frame from buffer
                    if buffer:
                        emit = buffer.popleft()
                        if not frame_queue.full():
                            try:
                                frame_queue.put_nowait(emit)
                            except queue.Full:
                                pass

                    # Pace to target FPS
                    elapsed = time.time() - t0
                    if elapsed < frame_delay:
                        time.sleep(frame_delay - elapsed)

                # Flush remaining buffer
                while buffer:
                    emit = buffer.popleft()
                    if not frame_queue.full():
                        try:
                            frame_queue.put_nowait(emit)
                        except queue.Full:
                            pass

            except Exception as e:
                log.error(f"Producer crashed: {e}")
            finally:
                cap.release()
                frame_queue.put(None)

        t = threading.Thread(target=producer, daemon=True)
        t.start()

        async def async_consumer():
            loop = asyncio.get_event_loop()
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

        return StreamingHttpResponse(
            async_consumer(),
            content_type="multipart/x-mixed-replace; boundary=frame"
        )
