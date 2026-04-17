import logging, time, base64
from io import BytesIO
from datetime import timedelta

import cv2
import numpy as np
from celery import shared_task
from django.conf import settings
from django.db import models as django_models

def _get_config(key, default):
    """Get config from DB, fallback to settings/default"""
    try:
        from apps.core.models import SystemConfig
        val = SystemConfig.get(key)
        return val if val is not None else default
    except Exception:
        return default
from django.utils import timezone
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)
_yolo_model = None


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


def _enc(frame):
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(buf).decode()


def _dec(b64):
    data = base64.b64decode(b64)
    arr  = np.frombuffer(data, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _frame_cf(frame, name):
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return ContentFile(buf.tobytes(), name=name)


@shared_task(bind=True, max_retries=3, queue="cameras")
def start_camera_processing(self, camera_id: int):
    from .models import Camera
    try:
        camera = Camera.objects.get(pk=camera_id)
    except Camera.DoesNotExist:
        return

    cap = cv2.VideoCapture(camera.get_stream_url())
    if not cap.isOpened():
        Camera.objects.filter(pk=camera_id).update(status="offline")
        raise self.retry(countdown=30)

    Camera.objects.filter(pk=camera_id).update(status="online")
    interval  = 1.0 / _get_config("ANALYSIS_FPS", settings.ANALYSIS_FPS)
    last_time = 0
    is_file   = camera.protocol in ("file", "youtube")
    fps       = cap.get(cv2.CAP_PROP_FPS) or 25
    skip      = max(1, int(fps / _get_config("ANALYSIS_FPS", settings.ANALYSIS_FPS)))
    frame_n   = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                # Para arquivo/youtube: marca como "processado"
                if is_file:
                    Camera.objects.filter(pk=camera_id).update(is_active=False, status="offline")
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

            # Only save snapshot if frame is bright enough (not black)
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

            analyze_frame.delay(camera_id, _enc(frame))

            if not Camera.objects.filter(pk=camera_id, is_active=True).exists():
                break
    except Exception as e:
        logger.exception(f"Camera {camera_id} processing error: {e}")
    finally:
        cap.release()
        Camera.objects.filter(pk=camera_id).update(status="offline")


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

    model   = _get_yolo()
    results = model.track(frame, persist=True, verbose=False, conf=_get_config("DETECTION_CONFIDENCE", settings.DETECTION_CONFIDENCE))
    dets    = _parse_dets(results)

    # Process line crossing for people counting (runs every frame)
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

        result = _eval_rule(rule, dets, frame)
        if result is None or not result[0]:
            continue
        triggered, desc, data = result

        _mark_cooldown(rule, camera)
        cf    = _frame_cf(frame, f"alert_{camera_id}_{rule.id}.jpg")
        alert = Alert.objects.create(rule=rule, camera=camera, description=desc, detection_data=data)
        alert.snapshot.save(cf.name, cf, save=True)

        from apps.notifications.tasks import send_alert_notifications
        send_alert_notifications.delay(alert.id)

        from apps.core.consumers import broadcast_alert
        broadcast_alert(alert)

        # Save time-series metric
        metric_map = {
            "people_counter":  ("people_count",  data.get("count", 0)),
            "queue_detection": ("queue_size",     data.get("count", 0)),
            "vehicle_zone":    ("vehicle_count",  len([d for d in dets if d.get("class") in {"car","truck","motorcycle","bus"}])),
            "crowding":        ("people_count",   data.get("count", 0)),
            "motion":          ("motion_score",   float(data.get("count", len(dets)))),
        }
        if rule.behavior in metric_map:
            mtype, mval = metric_map[rule.behavior]
            try:
                from apps.cameras.models import CameraMetric
                CameraMetric.objects.create(camera=camera, metric_type=mtype, value=mval)
            except Exception:
                pass


# In-memory position tracking per camera: {camera_id: {track_id: last_y}}
_track_positions: dict = {}
# Cooldown: {camera_id: {track_id: timestamp}} - avoid double counting
_track_cooldown: dict = {}

def _process_line_crossing(camera_id: int, camera, dets: list, frame):
    """Process line crossings for people counting. Called every analyzed frame."""
    if not camera.entry_line_y:
        return

    line_y_pct = float(camera.entry_line_y)
    h_f = frame.shape[0]
    line_y_px  = line_y_pct * h_f

    cam_tracks = _track_positions.setdefault(camera_id, {})
    cam_cool   = _track_cooldown.setdefault(camera_id, {})
    now = time.time()

    entries = 0
    exits   = 0

    for det in dets:
        if det.get("class") != "person":
            continue
        track_id = det.get("track_id")
        if track_id is None:
            continue

        bbox = det["bbox"]
        cy   = (bbox[1] + bbox[3]) / 2  # center y in pixels

        prev_y = cam_tracks.get(track_id)
        cam_tracks[track_id] = cy

        if prev_y is None:
            continue

        # Check cooldown (5 seconds per track_id to avoid double counting)
        last_cross = cam_cool.get(track_id, 0)
        if now - last_cross < 5:
            continue

        # Line crossing detection
        if prev_y < line_y_px <= cy:      # moving downward → entry
            entries += 1
            cam_cool[track_id] = now
            logger.info(f"[COUNTER] Camera {camera_id} — ENTRADA track={track_id}")
        elif prev_y > line_y_px >= cy:    # moving upward → exit
            exits += 1
            cam_cool[track_id] = now
            logger.info(f"[COUNTER] Camera {camera_id} — SAÍDA track={track_id}")

    # Clean up old track_ids (older than 30 seconds without update)
    stale = [tid for tid, y in list(cam_tracks.items()) if tid not in [d.get("track_id") for d in dets]]
    for tid in stale[:20]:  # clean max 20 per frame
        cam_tracks.pop(tid, None)
        cam_cool.pop(tid, None)

    if entries > 0 or exits > 0:
        try:
            from apps.locations.models import VisitorCount
            from django.utils import timezone
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
            # Update peak hour
            import pytz
            from datetime import datetime
            tz    = pytz.timezone(settings.TIME_ZONE)
            hour  = datetime.now(tz).hour
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
    stale  = Camera.objects.filter(is_active=True, last_seen__lt=cutoff)
    for cam in stale:
        cam.status = "offline"
        cam.save(update_fields=["status"])
        start_camera_processing.delay(cam.id)


def _parse_dets(results):
    dets = []
    for r in results:
        if r.boxes is None:
            continue
        for i, box in enumerate(r.boxes):
            dets.append({
                "class":      r.names[int(box.cls)],
                "confidence": float(box.conf),
                "bbox":       box.xyxy[0].tolist(),
                "track_id":   int(box.id) if box.id is not None else i,
            })
    return dets


# In-memory cooldown cache: {(rule_id, camera_id): last_trigger_timestamp}
_cooldown_cache: dict = {}

def _in_cooldown(rule, camera):
    key = (rule.id, camera.id)
    now = time.time()
    last = _cooldown_cache.get(key, 0)
    if now - last < rule.cooldown_seconds:
        return True
    return False

def _mark_cooldown(rule, camera):
    _cooldown_cache[(rule.id, camera.id)] = time.time()


def _eval_rule(rule, dets, frame):
    b       = rule.behavior
    params  = rule.params or {}

    # ── Schedule check (universal — funciona pra qualquer regra) ──────────
    schedule_start = params.get("schedule_start")
    schedule_end = params.get("schedule_end")
    if schedule_start is not None and schedule_end is not None:
        import pytz
        from datetime import datetime
        tz = pytz.timezone(settings.TIME_ZONE)
        now = datetime.now(tz)
        h = now.hour

        # Check dias da semana (0=segunda, 6=domingo). Se nao definido, vale todo dia.
        schedule_days = params.get("schedule_days")
        if schedule_days is not None and now.weekday() not in schedule_days:
            return False, "", {}

        # Check horario (suporta ranges que cruzam meia-noite, ex: 22-06)
        if schedule_start <= schedule_end:
            in_schedule = schedule_start <= h < schedule_end
        else:
            in_schedule = h >= schedule_start or h < schedule_end

        if not in_schedule:
            return False, "", {}
    # ─────────────────────────────────────────────────────────────────────

    people  = [d for d in dets if d["class"] == "person"]

    if b == "motion":
        return len(dets) > 0, f"{len(dets)} objeto(s) detectado(s)", {"count": len(dets)}

    if b == "crowding":
        limit = params.get("crowd_count", 5)
        ok    = len(people) >= limit
        return ok, f"{len(people)} pessoas (limite {limit})", {"count": len(people)}

    if b == "restricted_zone":
        zones = params.get("zones", [])
        if not zones:
            return False, "", {}
        h, w  = frame.shape[:2]
        for p in people:
            cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w
            cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h
            if _in_polygon([cx, cy], zones):
                return True, "Pessoa em zona restrita", {"person": p}
        return False, "", {}

    if b == "night_movement":
        import pytz
        from datetime import datetime
        tz    = pytz.timezone(settings.TIME_ZONE)
        h_now = datetime.now(tz).hour
        s     = params.get("schedule_start", 22)
        e     = params.get("schedule_end", 6)
        in_s  = h_now >= s or h_now < e
        ok    = in_s and len(people) > 0
        return ok, f"Movimento noturno — {len(people)} pessoa(s)", {"count": len(people)}

    if b == "loitering":
        return len(people) > 0, "Permanência prolongada detectada", {"count": len(people)}

    if b == "ai_vision":
        prompt = params.get("ai_prompt", "Existe comportamento suspeito? JSON: {alerta:bool, descricao:string}")
        return _claude_vision(frame, prompt)


    # ── VAREJO ────────────────────────────────────────────────────────────────

    if b == "people_counter":
        # Counts people in frame — alert when above threshold
        limit = params.get("max_people", 0)
        count = len(people)
        if limit > 0 and count >= limit:
            return True, f"{count} pessoas no local (limite {limit})", {"count": count}
        return False, "", {"count": count}

    if b == "queue_detection":
        # Alert when too many people in a defined zone (queue area)
        limit = params.get("queue_limit", 5)
        zones = params.get("zones", [])
        h_f, w_f = frame.shape[:2]
        if zones:
            in_zone = []
            for p in people:
                cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w_f
                cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h_f
                if _in_polygon([cx, cy], zones):
                    in_zone.append(p)
            count = len(in_zone)
        else:
            count = len(people)
        ok = count >= limit
        return ok, f"Fila com {count} pessoa(s) (limite {limit})", {"count": count}

    if b == "abandoned_object":
        # Detect bags/backpacks/suitcases without a person nearby
        bag_classes = {"backpack", "handbag", "suitcase", "luggage"}
        bags = [d for d in dets if d["class"] in bag_classes]
        if not bags:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for bag in bags:
            bx = (bag["bbox"][0] + bag["bbox"][2]) / 2
            by = (bag["bbox"][1] + bag["bbox"][3]) / 2
            # Check if any person is close to this bag
            person_nearby = False
            for p in people:
                px = (p["bbox"][0] + p["bbox"][2]) / 2
                py = (p["bbox"][1] + p["bbox"][3]) / 2
                dist = ((bx - px)**2 + (by - py)**2) ** 0.5
                if dist < w_f * 0.2:  # within 20% of frame width
                    person_nearby = True
                    break
            if not person_nearby:
                return True, f"Objeto abandonado detectado ({bag['class']})", {"object": bag["class"]}
        return False, "", {}

    if b == "shoplifting_posture":
        # Detect person crouching (bbox height < width * 0.8) near shelves zone
        for p in people:
            x1, y1, x2, y2 = p["bbox"]
            w_box = x2 - x1
            h_box = y2 - y1
            # Person crouching: bbox is wider than tall relative to normal
            if h_box > 0 and w_box / h_box > 1.2:
                return True, "Postura suspeita detectada (agachado)", {"confidence": p["confidence"]}
        return False, "", {}

    if b == "large_bag":
        # Person carrying large bag in restricted area
        bag_classes = {"backpack", "suitcase"}
        bags = [d for d in dets if d["class"] in bag_classes]
        zones = params.get("zones", [])
        if not bags or not people:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for p in people:
            for bag in bags:
                px = (p["bbox"][0] + p["bbox"][2]) / 2 / w_f
                py = (p["bbox"][1] + p["bbox"][3]) / 2 / h_f
                if not zones or _in_polygon([px, py], zones):
                    return True, f"Pessoa com {bag['class']} em zona monitorada", {"bag": bag["class"]}
        return False, "", {}

    # ── SEGURANÇA ─────────────────────────────────────────────────────────────

    if b == "running":
        # Detect running: person bbox is much wider than tall (horizontal movement blur)
        # or large bbox change between frames — simplified: very large person bbox
        for p in people:
            x1, y1, x2, y2 = p["bbox"]
            area = (x2-x1) * (y2-y1)
            frame_area = frame.shape[0] * frame.shape[1]
            # Large fast-moving person takes up significant frame area
            if area / frame_area > 0.05 and p["confidence"] > 0.7:
                return True, "Pessoa correndo detectada", {"confidence": p["confidence"]}
        return False, "", {}

    if b == "vehicle_pedestrian":
        # Vehicle detected in pedestrian zone
        vehicle_classes = {"car", "truck", "motorcycle", "bus", "bicycle"}
        vehicles = [d for d in dets if d["class"] in vehicle_classes]
        zones = params.get("zones", [])
        if not vehicles:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for v in vehicles:
            cx = (v["bbox"][0] + v["bbox"][2]) / 2 / w_f
            cy = (v["bbox"][1] + v["bbox"][3]) / 2 / h_f
            if not zones or _in_polygon([cx, cy], zones):
                return True, f"{v['class']} em área de pedestre", {"vehicle": v["class"]}
        return False, "", {}

    if b == "perimeter_breach":
        # Person detected in outer perimeter zone after hours
        zones = params.get("zones", [])
        if not zones or not people:
            return False, "", {}
        h_f, w_f = frame.shape[:2]
        for p in people:
            cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w_f
            cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h_f
            if _in_polygon([cx, cy], zones):
                return True, "Invasão de perímetro detectada", {"confidence": p["confidence"]}
        return False, "", {}

    if b == "tailgating":
        # Multiple people detected at entry zone simultaneously
        zones = params.get("zones", [])
        max_allowed = params.get("max_allowed", 1)
        if not zones:
            return len(people) > max_allowed, f"{len(people)} pessoas em zona de acesso", {"count": len(people)}
        h_f, w_f = frame.shape[:2]
        in_zone = sum(1 for p in people if _in_polygon(
            [(p["bbox"][0]+p["bbox"][2])/2/w_f, (p["bbox"][1]+p["bbox"][3])/2/h_f], zones
        ))
        ok = in_zone > max_allowed
        return ok, f"{in_zone} pessoas passando simultaneamente (max {max_allowed})", {"count": in_zone}

    # ── SAÚDE / BEM-ESTAR ─────────────────────────────────────────────────────

    if b == "lone_child":
        # Person detected alone (no adult nearby) — simplified: single small bbox person
        if len(people) != 1:
            return False, "", {}
        p = people[0]
        x1, y1, x2, y2 = p["bbox"]
        h_box = y2 - y1
        frame_h = frame.shape[0]
        # Small person (child-sized) alone
        if h_box / frame_h < 0.4:
            return True, "Criança desacompanhada detectada", {"confidence": p["confidence"]}
        return False, "", {}

    if b == "pool_risk":
        # Person detected at pool edge (bottom zone of frame) alone
        if not people:
            return False, "", {}
        frame_h = frame.shape[0]
        zones = params.get("zones", [])
        h_f, w_f = frame.shape[:2]
        for p in people:
            cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w_f
            cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h_f
            # Near pool edge zone or bottom of frame
            near_edge = zones and _in_polygon([cx, cy], zones) or (not zones and cy > 0.75)
            if near_edge:
                return True, "Pessoa próxima à borda da piscina", {"confidence": p["confidence"]}
        return False, "", {}

    if b == "bathroom_loiter":
        # Requires persistent tracking to measure actual duration — simplified:
        # only alert when multiple people detected (possible incident)
        threshold_people = params.get("min_people", 1)
        if len(people) >= threshold_people:
            return True, f"Permanência longa em banheiro — {len(people)} pessoa(s)", {"count": len(people)}
        return False, "", {}

    if b == "motionless_person":
        # Use track_id to detect person with no position change between frames
        min_frames = params.get("min_frames", 10)
        cam_tracks = _track_positions.get(camera_id, {})
        for p in people:
            track_id = p.get("track_id")
            if track_id is None:
                continue
            bbox = p["bbox"]
            cy = (bbox[1] + bbox[3]) / 2
            cx = (bbox[0] + bbox[2]) / 2
            prev_y = cam_tracks.get(track_id)
            if prev_y is not None:
                # Check if person barely moved (within 5px)
                if abs(cy - prev_y) < 5:
                    motionless_key = f"motionless_{camera_id}_{track_id}"
                    count = _cooldown_cache.get(motionless_key, 0) + 1
                    _cooldown_cache[motionless_key] = count
                    if count >= min_frames:
                        _cooldown_cache[motionless_key] = 0
                        return True, "Pessoa imóvel detectada (possível emergência)", {"track_id": track_id, "frames": count}
                else:
                    _cooldown_cache[f"motionless_{camera_id}_{track_id}"] = 0
        return False, "", {}

    # ── INDÚSTRIA ─────────────────────────────────────────────────────────────

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

    if b == "no_hardhat":
        # Person without helmet/hardhat
        # YOLOv8 standard doesn't detect hardhats — uses person detection as proxy
        # For proper detection, need PPE model
        helmets = [d for d in dets if d["class"] in {"helmet", "hard hat", "hardhat"}]
        if people and not helmets:
            return True, f"{len(people)} pessoa(s) sem capacete detectada(s)", {"people": len(people)}
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

    # ── VEÍCULOS ──────────────────────────────────────────────────────────────

    if b == "wrong_way":
        # Vehicle detected moving against flow — simplified: vehicle in entry-only zone
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
        # Many people near/in vehicle
        limit = params.get("max_people", 5)
        if len(people) >= limit:
            return True, f"{len(people)} pessoas próximas ao veículo", {"count": len(people)}
        return False, "", {}

    if b == "visitor_counter":
        # Line crossing counter — handled by _process_line_crossing for accuracy.
        # This rule only alerts when daily limit is exceeded.
        max_daily = params.get("max_daily", 0)
        if max_daily > 0:
            try:
                from apps.locations.models import VisitorCount
                from django.utils import timezone
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
    import anthropic, json
    try:
        client = anthropic.Anthropic()
        resp   = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": _enc(frame)}},
                {"type": "text",  "text": prompt}
            ]}]
        )
        data = json.loads(resp.content[0].text)
        return bool(data.get("alerta")), data.get("descricao", ""), {"source": "claude"}
    except Exception as e:
        logger.error(f"Claude Vision error: {e}")
        return False, "", {}
