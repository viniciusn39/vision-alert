"""
Tasks de processamento de câmera.

Mudanças desta versão:
- Cooldown de regras em Redis (antes era dict in-memory, não funcionava com
  múltiplos workers Celery: cada worker tinha sua cópia).
- Tracking de posições (line crossing) em Redis com TTL.
- Lock distribuído em start_camera_processing para evitar duas VideoCapture
  simultâneas da mesma câmera quando o health check dispara retries.
- Pre-warm do modelo YOLO no worker_ready signal.
- Logs explícitos de início de processamento, fim de vídeo e alerta gerado.
"""
import logging
import time
import base64
from io import BytesIO
from datetime import timedelta

import cv2
import numpy as np
from celery import shared_task
from celery.signals import worker_ready
from django.conf import settings
from django.core.cache import cache
from django.db import models as django_models
from django.utils import timezone
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)
_yolo_model = None


# ── YOLO singleton por worker ─────────────────────────────────────────────────

def _get_yolo():
    global _yolo_model
    if _yolo_model is None:
        import os
        os.environ["YOLO_VERBOSE"] = "false"
        from ultralytics import YOLO
        from ultralytics import settings as ul_settings
        ul_settings.update({"sync": False, "clearml": False, "comet": False,
                            "dvc": False, "mlflow": False, "neptune": False,
                            "raytune": False, "tensorboard": False, "wandb": False})
        _yolo_model = YOLO(settings.YOLO_MODEL)
    return _yolo_model


@worker_ready.connect
def prewarm_yolo(**kwargs):
    """Carrega YOLO assim que o worker sobe — evita latência no primeiro frame."""
    try:
        _get_yolo()
        logger.info("YOLO pré-carregado no worker Celery")
    except Exception as e:
        logger.warning(f"YOLO prewarm falhou (ok, vai carregar sob demanda): {e}")


# ── Config overrides do DB ────────────────────────────────────────────────────

def _get_config(key, default):
    try:
        from apps.core.models import SystemConfig
        val = SystemConfig.get(key)
        return val if val is not None else default
    except Exception:
        return default


# ── Helpers de encoding ───────────────────────────────────────────────────────

def _enc(frame):
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(buf).decode()


def _dec(b64):
    data = base64.b64decode(b64)
    arr = np.frombuffer(data, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _frame_cf(frame, name):
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return ContentFile(buf.tobytes(), name=name)


# ── Cooldown distribuído em Redis ─────────────────────────────────────────────

def _cooldown_key(rule_id, camera_id):
    return f"rule_cooldown:{rule_id}:{camera_id}"


def _in_cooldown(rule, camera):
    """True se a regra ainda está no cooldown para esta câmera."""
    return cache.get(_cooldown_key(rule.id, camera.id)) is not None


def _mark_cooldown(rule, camera):
    """Marca cooldown — TTL = rule.cooldown_seconds. Atômico via Redis SETEX."""
    cache.set(_cooldown_key(rule.id, camera.id), 1, timeout=rule.cooldown_seconds)


# ── Tracking de posições (line crossing) em Redis ─────────────────────────────

# Redis hash por câmera: hash {track_id -> last_y}, TTL 60s.
# Cooldown por track: key com TTL 5s. Ambos renovados a cada update.

def _track_pos_key(camera_id):
    return f"track_pos:{camera_id}"


def _track_cool_key(camera_id, track_id):
    return f"track_cool:{camera_id}:{track_id}"


def _get_track_positions(camera_id):
    """Retorna dict {track_id: last_y_pixel} do Redis."""
    raw = cache.get(_track_pos_key(camera_id))
    return raw or {}


def _save_track_positions(camera_id, positions):
    cache.set(_track_pos_key(camera_id), positions, timeout=60)


def _track_in_cooldown(camera_id, track_id):
    return cache.get(_track_cool_key(camera_id, track_id)) is not None


def _mark_track_cooldown(camera_id, track_id, seconds=5):
    cache.set(_track_cool_key(camera_id, track_id), 1, timeout=seconds)


# ── Lock distribuído de câmera ────────────────────────────────────────────────

def _camera_lock_key(camera_id):
    return f"camera_lock:{camera_id}"


# ── Task principal ────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, queue="cameras")
def start_camera_processing(self, camera_id: int):
    from .models import Camera

    # Lock distribuído — não abrir dois VideoCapture da mesma câmera.
    # add() é atômico; retorna False se já existe.
    lock_key = _camera_lock_key(camera_id)
    if not cache.add(lock_key, "1", timeout=settings.LIVE_STREAM_MAX_SECONDS):
        logger.info(f"Camera {camera_id}: já está sendo processada por outro worker")
        return

    try:
        try:
            camera = Camera.objects.get(pk=camera_id)
        except Camera.DoesNotExist:
            return

        cap = cv2.VideoCapture(camera.get_stream_url())
        if not cap.isOpened():
            Camera.objects.filter(pk=camera_id).update(status="offline")
            raise self.retry(countdown=30)

        Camera.objects.filter(pk=camera_id).update(status="online")
        fps_target = _get_config("ANALYSIS_FPS", settings.ANALYSIS_FPS)
        interval = 1.0 / fps_target
        last_time = 0
        is_file = camera.protocol in ("file", "youtube")
        logger.info("Camera %s (%s): processamento iniciado [%s]", camera_id,
                    camera.name, "arquivo - roda uma vez" if is_file else "continuo")
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        skip = max(1, int(fps / fps_target))
        frame_n = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    if is_file:
                        Camera.objects.filter(pk=camera_id).update(
                            is_active=False, status="offline"
                        )
                        logger.info("Camera %s: video terminou - camera parada (Stop).", camera_id)
                    break
                frame_n += 1
                if is_file:
                    if frame_n % skip != 0:
                        continue
                else:
                    now = time.time()
                    if now - last_time < interval:
                        continue
                    last_time = now

                if frame.mean() > 15:
                    cf = _frame_cf(frame, f"snap_{camera_id}.jpg")
                    cam = Camera.objects.get(pk=camera_id)
                    cam.snapshot.save(cf.name, cf, save=False)
                    Camera.objects.filter(pk=camera_id).update(
                        last_seen=timezone.now(), status="online", snapshot=cam.snapshot
                    )
                else:
                    Camera.objects.filter(pk=camera_id).update(
                        last_seen=timezone.now(), status="online"
                    )

                analyze_frame.apply_async(args=[camera_id, _enc(frame)], queue="analysis")

                # Renova lock para não expirar durante stream longo
                cache.set(lock_key, "1", timeout=settings.LIVE_STREAM_MAX_SECONDS)

                if not Camera.objects.filter(pk=camera_id, is_active=True).exists():
                    break
        except Exception as e:
            logger.exception(f"Camera {camera_id} processing error: {e}")
        finally:
            cap.release()
            # Arquivo/YouTube e finito: ao encerrar o processamento por
            # QUALQUER motivo (fim do video, excecao, timeout, interrupcao),
            # a camera volta para Stop (is_active=False).
            # Camera continua (RTSP) so atualiza o status.
            if is_file:
                Camera.objects.filter(pk=camera_id).update(
                    is_active=False, status="offline"
                )
                logger.info("Camera %s: processamento encerrado - camera parada (Stop).", camera_id)
            else:
                Camera.objects.filter(pk=camera_id).update(status="offline")
    finally:
        cache.delete(lock_key)


@shared_task(queue="cameras")
def analyze_frame(camera_id: int, frame_b64: str):
    from .models import Camera
    from apps.alerts.models import AlertRule, Alert

    try:
        camera = Camera.objects.get(pk=camera_id)
    except Camera.DoesNotExist:
        return

    frame = _dec(frame_b64)
    if frame is None:
        return

    model = _get_yolo()
    results = model.track(
        frame, persist=True, verbose=False,
        conf=_get_config("DETECTION_CONFIDENCE", settings.DETECTION_CONFIDENCE)
    )
    dets = _parse_dets(results)

    _process_line_crossing(camera_id, camera, dets, frame)

    rules = AlertRule.objects.filter(
        is_active=True, tenant=camera.tenant
    ).prefetch_related("cameras")

    for rule in rules:
        cam_ids = list(rule.cameras.values_list("id", flat=True))
        if cam_ids and camera_id not in cam_ids:
            continue
        if _in_cooldown(rule, camera):
            continue

        result = _eval_rule(rule, dets, frame, camera_id)
        if result is None or not result[0]:
            continue
        triggered, desc, data = result

        _mark_cooldown(rule, camera)
        cf = _frame_cf(frame, f"alert_{camera_id}_{rule.id}.jpg")
        alert = Alert.objects.create(
            rule=rule, camera=camera, description=desc, detection_data=data
        )
        alert.snapshot.save(cf.name, cf, save=True)
        logger.info("ALERTA gerado - camera=%s regra='%s' (%s): %s",
                    camera_id, rule.name, rule.behavior, desc)

        from apps.notifications.tasks import send_alert_notifications
        send_alert_notifications.delay(alert.id)

        from apps.core.consumers import broadcast_alert
        broadcast_alert(alert)

        metric_map = {
            "people_counter":  ("people_count",  data.get("count", 0)),
            "queue_detection": ("queue_size",    data.get("count", 0)),
            "vehicle_zone":    ("vehicle_count", len([d for d in dets if d.get("class") in {"car", "truck", "motorcycle", "bus"}])),
            "crowding":        ("people_count",  data.get("count", 0)),
            "motion":          ("motion_score",  float(data.get("count", len(dets)))),
        }
        if rule.behavior in metric_map:
            mtype, mval = metric_map[rule.behavior]
            try:
                from apps.cameras.models import CameraMetric
                CameraMetric.objects.create(camera=camera, metric_type=mtype, value=mval)
            except Exception:
                pass


# ── Line crossing (contagem de entrada/saída) ─────────────────────────────────

def _process_line_crossing(camera_id: int, camera, dets: list, frame):
    if not camera.entry_line_y:
        return

    line_y_pct = float(camera.entry_line_y)
    h_f = frame.shape[0]
    line_y_px = line_y_pct * h_f

    positions = _get_track_positions(camera_id)
    entries = 0
    exits = 0
    new_positions = {}

    for det in dets:
        if det.get("class") != "person":
            continue
        track_id = det.get("track_id")
        if track_id is None:
            continue

        bbox = det["bbox"]
        cy = (bbox[1] + bbox[3]) / 2

        # Redis serializa keys como str — normaliza
        tid_key = str(track_id)
        prev_y = positions.get(tid_key)
        new_positions[tid_key] = cy

        if prev_y is None:
            continue

        if _track_in_cooldown(camera_id, track_id):
            continue

        # Cruzamento para baixo = entrada; para cima = saída
        if prev_y < line_y_px <= cy:
            entries += 1
            _mark_track_cooldown(camera_id, track_id)
            logger.info(f"[COUNTER] Camera {camera_id} ENTRADA track={track_id}")
        elif prev_y > line_y_px >= cy:
            exits += 1
            _mark_track_cooldown(camera_id, track_id)
            logger.info(f"[COUNTER] Camera {camera_id} SAÍDA track={track_id}")

    _save_track_positions(camera_id, new_positions)

    if entries > 0 or exits > 0:
        try:
            from apps.locations.models import VisitorCount
            today = timezone.now().date()
            vc, _ = VisitorCount.objects.get_or_create(
                camera=camera, date=today,
                defaults={"location": camera.location_obj}
            )
            if entries:
                VisitorCount.objects.filter(pk=vc.pk).update(
                    entries=django_models.F("entries") + entries
                )
            if exits:
                VisitorCount.objects.filter(pk=vc.pk).update(
                    exits=django_models.F("exits") + exits
                )
            import pytz
            from datetime import datetime
            tz = pytz.timezone(settings.TIME_ZONE)
            hour = datetime.now(tz).hour
            vc.refresh_from_db()
            total_now = max(0, vc.entries - vc.exits)
            if total_now > vc.peak_count:
                VisitorCount.objects.filter(pk=vc.pk).update(
                    peak_count=total_now, peak_hour=hour
                )
        except Exception as e:
            logger.error(f"VisitorCount save error: {e}")


@shared_task(queue="cameras")
def check_cameras_health():
    from .models import Camera
    cutoff = timezone.now() - timedelta(seconds=30)
    stale = Camera.objects.filter(is_active=True, last_seen__lt=cutoff)
    for cam in stale:
        cam.status = "offline"
        cam.save(update_fields=["status"])
        # start_camera_processing tem lock distribuído; se já está rodando,
        # a task sai logo.
        start_camera_processing.delay(cam.id)


def _parse_dets(results):
    dets = []
    for r in results:
        if r.boxes is None:
            continue
        for i, box in enumerate(r.boxes):
            dets.append({
                "class": r.names[int(box.cls)],
                "confidence": float(box.conf),
                "bbox": box.xyxy[0].tolist(),
                "track_id": int(box.id) if box.id is not None else i,
            })
    return dets


# ── Motorless person tracking (usa Redis para contar frames sem movimento) ────

def _motionless_frame_count(camera_id, track_id):
    key = f"motionless:{camera_id}:{track_id}"
    current = cache.get(key, 0)
    cache.set(key, current + 1, timeout=60)
    return current + 1


def _reset_motionless(camera_id, track_id):
    cache.delete(f"motionless:{camera_id}:{track_id}")


# ── Eval de regras ────────────────────────────────────────────────────────────

def _eval_rule(rule, dets, frame, camera_id):
    b = rule.behavior
    params = rule.params or {}

    # Schedule universal
    schedule_start = params.get("schedule_start")
    schedule_end = params.get("schedule_end")
    if schedule_start is not None and schedule_end is not None:
        import pytz
        from datetime import datetime
        tz = pytz.timezone(settings.TIME_ZONE)
        now = datetime.now(tz)
        h = now.hour

        schedule_days = params.get("schedule_days")
        if schedule_days is not None and now.weekday() not in schedule_days:
            return False, "", {}

        if schedule_start <= schedule_end:
            in_schedule = schedule_start <= h < schedule_end
        else:
            in_schedule = h >= schedule_start or h < schedule_end

        if not in_schedule:
            return False, "", {}

    people = [d for d in dets if d["class"] == "person"]

    if b == "motion":
        return len(dets) > 0, f"{len(dets)} objeto(s) detectado(s)", {"count": len(dets)}

    if b == "crowding":
        limit = params.get("crowd_count", 5)
        ok = len(people) >= limit
        return ok, f"{len(people)} pessoas (limite {limit})", {"count": len(people)}

    if b == "restricted_zone":
        zones = params.get("zones", [])
        if not zones:
            return False, "", {}
        h, w = frame.shape[:2]
        for p in people:
            cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w
            cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h
            if _in_polygon([cx, cy], zones):
                return True, "Pessoa em zona restrita", {"person": p}
        return False, "", {}

    if b == "night_movement":
        import pytz
        from datetime import datetime
        tz = pytz.timezone(settings.TIME_ZONE)
        h_now = datetime.now(tz).hour
        s = params.get("schedule_start", 22)
        e = params.get("schedule_end", 6)
        in_s = h_now >= s or h_now < e
        ok = in_s and len(people) > 0
        return ok, f"Movimento noturno — {len(people)} pessoa(s)", {"count": len(people)}

    if b == "loitering":
        return len(people) > 0, "Permanência prolongada detectada", {"count": len(people)}

    if b == "ai_vision":
        prompt = params.get(
            "ai_prompt",
            "Existe comportamento suspeito? JSON: {alerta:bool, descricao:string}"
        )
        return _claude_vision(frame, prompt)

    if b == "people_counter":
        limit = params.get("max_people", 0)
        count = len(people)
        if limit > 0 and count >= limit:
            return True, f"{count} pessoas no local (limite {limit})", {"count": count}
        return False, "", {"count": count}

    if b == "queue_detection":
        limit = params.get("queue_limit", 5)
        zones = params.get("zones", [])
        h_f, w_f = frame.shape[:2]
        if zones:
            in_zone = sum(1 for p in people if _in_polygon(
                [(p["bbox"][0] + p["bbox"][2]) / 2 / w_f,
                 (p["bbox"][1] + p["bbox"][3]) / 2 / h_f],
                zones
            ))
            ok = in_zone >= limit
            return ok, f"Fila com {in_zone} pessoas (limite {limit})", {"count": in_zone}
        ok = len(people) >= limit
        return ok, f"Fila com {len(people)} pessoas (limite {limit})", {"count": len(people)}

    if b == "vehicle_pedestrian":
        vehicles = [d for d in dets if d["class"] in {"car", "truck", "motorcycle", "bus"}]
        if vehicles and people:
            return True, f"{vehicles[0]['class']} em área de pedestre", {"vehicle": vehicles[0]["class"]}
        return False, "", {}

    if b == "vehicle_zone":
        vehicle_classes = {"car", "truck", "forklift", "bus", "motorcycle"}
        vehicles = [d for d in dets if d["class"] in vehicle_classes]
        zones = params.get("zones", [])
        if not vehicles:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for v in vehicles:
            cx = (v["bbox"][0] + v["bbox"][2]) / 2 / w_f
            cy = (v["bbox"][1] + v["bbox"][3]) / 2 / h_f
            if not zones or _in_polygon([cx, cy], zones):
                return True, f"{v['class']} em zona proibida", {"vehicle": v["class"]}
        return False, "", {}

    if b == "animal_detection":
        animal_classes = {"cat", "dog", "bird", "horse", "cow", "sheep", "bear", "elephant", "zebra", "giraffe"}
        animals = [d for d in dets if d["class"] in animal_classes]
        zones = params.get("zones", [])
        if not animals:
            return False, "", {}
        if not zones:
            return True, f"Animal detectado: {animals[0]['class']}", {"animal": animals[0]["class"]}
        h_f, w_f = frame.shape[:2]
        for a in animals:
            cx = (a["bbox"][0] + a["bbox"][2]) / 2 / w_f
            cy = (a["bbox"][1] + a["bbox"][3]) / 2 / h_f
            if _in_polygon([cx, cy], zones):
                return True, f"Animal em área restrita: {a['class']}", {"animal": a["class"]}
        return False, "", {}

    if b == "motionless_person":
        min_frames = params.get("min_frames", 10)
        positions = _get_track_positions(camera_id)
        for p in people:
            track_id = p.get("track_id")
            if track_id is None:
                continue
            bbox = p["bbox"]
            cy = (bbox[1] + bbox[3]) / 2
            prev_y = positions.get(str(track_id))
            if prev_y is not None:
                if abs(cy - prev_y) < 5:
                    count = _motionless_frame_count(camera_id, track_id)
                    if count >= min_frames:
                        _reset_motionless(camera_id, track_id)
                        return True, "Pessoa imóvel (possível emergência)", {"track_id": track_id, "frames": count}
                else:
                    _reset_motionless(camera_id, track_id)
        return False, "", {}

    # ── VAREJO extendido ──────────────────────────────────────────────────────

    if b == "abandoned_object":
        bags = [d for d in dets if d["class"] in {"backpack", "handbag", "suitcase"}]
        if not bags:
            return False, "", {}
        for bag in bags:
            bx = (bag["bbox"][0] + bag["bbox"][2]) / 2
            by = (bag["bbox"][1] + bag["bbox"][3]) / 2
            near = any(
                ((bx - (p["bbox"][0] + p["bbox"][2]) / 2) ** 2 +
                 (by - (p["bbox"][1] + p["bbox"][3]) / 2) ** 2) ** 0.5 < frame.shape[1] * 0.2
                for p in people
            )
            if not near:
                return True, f"Objeto abandonado: {bag['class']}", {"object": bag["class"]}
        return False, "", {}

    if b == "shoplifting_posture":
        if len(people) == 0:
            return False, "", {}
        return False, "", {}

    if b == "large_bag":
        bags = [d for d in dets if d["class"] in {"backpack", "handbag", "suitcase"}]
        zones = params.get("zones", [])
        if not bags:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for bag in bags:
            x1, y1, x2, y2 = bag["bbox"]
            area_ratio = ((x2 - x1) * (y2 - y1)) / (w_f * h_f)
            if area_ratio > params.get("min_area", 0.05):
                cx = (x1 + x2) / 2 / w_f
                cy = (y1 + y2) / 2 / h_f
                if not zones or _in_polygon([cx, cy], zones):
                    return True, f"Bolsa/mochila grande detectada: {bag['class']}", {"object": bag["class"]}
        return False, "", {}

    # ── SEGURANÇA ─────────────────────────────────────────────────────────────

    if b == "running":
        # Proxy simples: qualquer pessoa detectada conta como possivelmente correndo
        # (requer modelo de pose para ser preciso)
        if len(people) >= params.get("min_people", 1):
            return True, f"Movimento acelerado detectado ({len(people)} pessoa(s))", {"count": len(people)}
        return False, "", {}

    if b == "perimeter_breach":
        zones = params.get("zones", [])
        if not zones or not people:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for p in people:
            cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w_f
            cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h_f
            if _in_polygon([cx, cy], zones):
                return True, "Invasão de perímetro detectada", {"person": p}
        return False, "", {}

    if b == "tailgating":
        # Duas ou mais pessoas próximas e em movimento pela porta
        if len(people) < 2:
            return False, "", {}
        return True, f"Possível tailgating — {len(people)} pessoas próximas", {"count": len(people)}

    # ── SAÚDE / BEM-ESTAR ─────────────────────────────────────────────────────

    if b == "lone_child":
        if len(people) != 1:
            return False, "", {}
        p = people[0]
        x1, y1, x2, y2 = p["bbox"]
        h_box = y2 - y1
        frame_h = frame.shape[0]
        if h_box / frame_h < 0.4:
            return True, "Criança desacompanhada detectada", {"confidence": p["confidence"]}
        return False, "", {}

    if b == "pool_risk":
        if not people:
            return False, "", {}
        zones = params.get("zones", [])
        h_f, w_f = frame.shape[:2]
        for p in people:
            cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w_f
            cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h_f
            near_edge = (zones and _in_polygon([cx, cy], zones)) or (not zones and cy > 0.75)
            if near_edge:
                return True, "Pessoa próxima à borda da piscina", {"confidence": p["confidence"]}
        return False, "", {}

    if b == "bathroom_loiter":
        threshold_people = params.get("min_people", 1)
        if len(people) >= threshold_people:
            return True, f"Permanência longa em banheiro — {len(people)} pessoa(s)", {"count": len(people)}
        return False, "", {}

    if b == "fall_detection":
        # Proxy: bbox com proporção largura/altura > 1 (pessoa deitada)
        for p in people:
            x1, y1, x2, y2 = p["bbox"]
            w = x2 - x1
            h = y2 - y1
            if h > 0 and w / h > 1.3:
                return True, "Possível queda detectada", {"track_id": p.get("track_id")}
        return False, "", {}

    # ── INDÚSTRIA ─────────────────────────────────────────────────────────────

    if b == "no_hardhat" or b == "missing_ppe":
        helmets = [d for d in dets if d["class"] in {"helmet", "hard hat", "hardhat"}]
        if people and not helmets:
            return True, f"{len(people)} pessoa(s) sem EPI detectada(s)", {"people": len(people)}
        return False, "", {}

    # ── VEÍCULOS ──────────────────────────────────────────────────────────────

    if b == "wrong_way":
        vehicle_classes = {"car", "truck", "motorcycle", "bus"}
        vehicles = [d for d in dets if d["class"] in vehicle_classes]
        zones = params.get("zones", [])
        if not vehicles or not zones:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for v in vehicles:
            cx = (v["bbox"][0] + v["bbox"][2]) / 2 / w_f
            cy = (v["bbox"][1] + v["bbox"][3]) / 2 / h_f
            if _in_polygon([cx, cy], zones):
                return True, f"Veículo em sentido proibido: {v['class']}", {"vehicle": v["class"]}
        return False, "", {}

    if b == "parking_violation":
        vehicle_classes = {"car", "truck", "motorcycle", "bus"}
        vehicles = [d for d in dets if d["class"] in vehicle_classes]
        zones = params.get("zones", [])
        if not vehicles:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for v in vehicles:
            cx = (v["bbox"][0] + v["bbox"][2]) / 2 / w_f
            cy = (v["bbox"][1] + v["bbox"][3]) / 2 / h_f
            if not zones or _in_polygon([cx, cy], zones):
                return True, f"Veículo estacionado em local proibido: {v['class']}", {"vehicle": v["class"]}
        return False, "", {}

    if b == "overcrowded_vehicle":
        vehicle_classes = {"car", "truck", "bus", "van"}
        vehicles = [d for d in dets if d["class"] in vehicle_classes]
        if not vehicles or not people:
            return False, "", {}
        limit = params.get("max_people", 5)
        if len(people) >= limit:
            return True, f"{len(people)} pessoas próximas ao veículo", {"count": len(people)}
        return False, "", {}

    if b == "visitor_counter":
        # Line crossing é tratado em _process_line_crossing. Aqui só dispara
        # alerta se houver limite diário e ele foi atingido.
        max_daily = params.get("max_daily", 0)
        if max_daily > 0:
            try:
                from apps.locations.models import VisitorCount
                vc = VisitorCount.objects.filter(
                    camera__tenant=rule.tenant, date=timezone.now().date()
                ).order_by("-entries").first()
                if vc and vc.entries >= max_daily:
                    return True, f"Limite diário atingido: {vc.entries} visitantes", {"entries": vc.entries}
            except Exception:
                pass
        return False, "", {}

    return False, "", {}


def _in_polygon(point, polygons):
    x, y = point
    for poly in polygons:
        pts = np.array(poly, dtype=np.float32)
        if cv2.pointPolygonTest(pts, (x, y), False) >= 0:
            return True
    return False


def _claude_vision(frame, prompt):
    import anthropic
    import json
    import re
    try:
        client = anthropic.Anthropic()
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": _enc(frame)}},
                {"type": "text", "text": prompt + "\n\nResponda APENAS com JSON puro, sem fences de markdown."}
            ]}]
        )
        text = resp.content[0].text
        # Extrai JSON mesmo se vier com ```json fences
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return False, "", {}
        data = json.loads(m.group(0))
        return bool(data.get("alerta")), data.get("descricao", ""), {"source": "claude"}
    except Exception as e:
        logger.error(f"Claude Vision error: {e}")
        return False, "", {}