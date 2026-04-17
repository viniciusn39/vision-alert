"""
VisionAlert Edge Worker
Celery worker that processes camera frames using YOLO on GPU.
Reads configuration from /app/config/current_config.json (written by sync agent).
Reports alerts and metrics back via the sync agent queues.
"""
import os
import json
import time
import logging
import base64
import cv2
import numpy as np
from celery import Celery

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("edge-worker")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
app = Celery("edge_worker", broker=REDIS_URL)
app.conf.task_default_queue = "cameras"

_yolo_model = None


def _get_yolo():
    global _yolo_model
    if _yolo_model is None:
        os.environ["YOLO_VERBOSE"] = "false"
        from ultralytics import YOLO
        from ultralytics import settings as ul_settings
        ul_settings.update({"sync": False, "clearml": False, "comet": False,
                            "dvc": False, "mlflow": False, "neptune": False,
                            "raytune": False, "tensorboard": False, "wandb": False})
        _yolo_model = YOLO("yolov8n.pt")
        log.info("YOLO model loaded")
    return _yolo_model


def _load_config():
    config_path = "/app/config/current_config.json"
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return {}


def _report_alert(rule_id, camera_id, description, detection_data, frame=None):
    """Send alert to central via sync agent."""
    import requests
    central_url = os.environ.get("CENTRAL_URL", "")
    device_key = os.environ.get("DEVICE_KEY", "")
    if not central_url or not device_key:
        return

    data = {
        "rule_id": rule_id,
        "camera_id": camera_id,
        "description": description,
        "detection_data": detection_data,
    }
    if frame is not None:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        data["snapshot_b64"] = base64.b64encode(buf.tobytes()).decode()

    try:
        requests.post(
            f"{central_url}/api/fleet/alert/",
            json=data,
            headers={"X-Device-Key": device_key, "Content-Type": "application/json"},
            timeout=10
        )
    except Exception as e:
        log.error(f"Alert report failed: {e}")


def _report_metric(camera_id, metric_type, value):
    """Send metric to central."""
    import requests
    central_url = os.environ.get("CENTRAL_URL", "")
    device_key = os.environ.get("DEVICE_KEY", "")
    if not central_url or not device_key:
        return
    try:
        requests.post(
            f"{central_url}/api/fleet/metrics/",
            json={"metrics": [{"camera_id": camera_id, "metric_type": metric_type, "value": value}]},
            headers={"X-Device-Key": device_key, "Content-Type": "application/json"},
            timeout=10
        )
    except Exception:
        pass


@app.task(name="edge.process_camera")
def process_camera(camera_id):
    """Main task: connect to camera, run YOLO, evaluate rules, report alerts."""
    config = _load_config()
    if not config:
        log.warning("No config available yet — waiting for sync")
        return

    # Find camera in config
    camera = None
    for cam in config.get("cameras", []):
        if cam["id"] == camera_id:
            camera = cam
            break

    if not camera:
        log.warning(f"Camera {camera_id} not in config")
        return

    # Build stream URL
    url = camera["url"]
    if camera.get("username") and camera.get("password"):
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(url)
        netloc = f"{camera['username']}:{camera['password']}@{parsed.hostname}"
        if parsed.port:
            netloc += f":{parsed.port}"
        url = urlunparse(parsed._replace(netloc=netloc))

    cap = cv2.VideoCapture(url)
    if not cap.isOpened():
        log.error(f"Camera {camera_id} ({camera['name']}): cannot open {camera['url']}")
        return

    log.info(f"Camera {camera_id} ({camera['name']}): processing started")
    model = _get_yolo()

    # Get rules for this camera
    rules = []
    for rule in config.get("rules", []):
        cam_ids = rule.get("camera_ids", [])
        if not cam_ids or camera_id in cam_ids:
            rules.append(rule)

    fps_target = config.get("config", {}).get("analysis_fps", 2)
    conf_threshold = config.get("config", {}).get("detection_confidence", 0.45)
    frame_interval = 1.0 / fps_target
    cooldowns = {}  # {rule_id: last_trigger_time}

    try:
        while True:
            t0 = time.time()
            ret, frame = cap.read()
            if not ret:
                break

            h, w = frame.shape[:2]
            if w > 640:
                frame = cv2.resize(frame, (640, int(h * 640 / w)))

            # Run YOLO
            results = model.track(frame, persist=True, verbose=False, conf=conf_threshold)
            dets = []
            for r in results:
                if r.boxes is None:
                    continue
                for box in r.boxes:
                    dets.append({
                        "class": r.names[int(box.cls)],
                        "confidence": float(box.conf),
                        "bbox": box.xyxy[0].tolist(),
                        "track_id": int(box.id) if box.id is not None else 0,
                    })

            people = [d for d in dets if d["class"] == "person"]

            # Evaluate rules
            for rule in rules:
                rid = rule["id"]
                now = time.time()
                cooldown = rule.get("cooldown_seconds", 60)

                if rid in cooldowns and now - cooldowns[rid] < cooldown:
                    continue

                triggered, desc = _eval_simple(rule, dets, people, frame)
                if triggered:
                    cooldowns[rid] = now
                    _report_alert(rid, camera_id, desc, {"count": len(people)}, frame)
                    log.info(f"ALERT: {rule['name']} — {desc}")

            # Wait for next frame
            elapsed = time.time() - t0
            if elapsed < frame_interval:
                time.sleep(frame_interval - elapsed)

    except Exception as e:
        log.error(f"Camera {camera_id} error: {e}")
    finally:
        cap.release()
        log.info(f"Camera {camera_id}: processing stopped")


def _eval_simple(rule, dets, people, frame):
    """Simplified rule evaluation for edge."""
    b = rule["behavior"]
    params = rule.get("params") or {}

    if b == "motion":
        if len(dets) > 0:
            return True, f"{len(dets)} objeto(s) detectado(s)"

    elif b == "crowding":
        limit = params.get("crowd_count", 5)
        if len(people) >= limit:
            return True, f"{len(people)} pessoas (limite {limit})"

    elif b == "restricted_zone":
        zones = params.get("zones", [])
        if zones and people:
            h, w = frame.shape[:2]
            for p in people:
                cx = (p["bbox"][0] + p["bbox"][2]) / 2 / w
                cy = (p["bbox"][1] + p["bbox"][3]) / 2 / h
                if _in_polygon([cx, cy], zones):
                    return True, "Pessoa em zona restrita"

    elif b == "people_counter":
        limit = params.get("max_people", 0)
        if limit > 0 and len(people) >= limit:
            return True, f"{len(people)} pessoas (limite {limit})"

    elif b == "night_movement":
        from datetime import datetime
        hour = datetime.now().hour
        s = params.get("schedule_start", 22)
        e = params.get("schedule_end", 6)
        in_schedule = hour >= s or hour < e
        if in_schedule and len(people) > 0:
            return True, f"Movimento noturno — {len(people)} pessoa(s)"

    elif b == "abandoned_object":
        bags = [d for d in dets if d["class"] in {"backpack", "handbag", "suitcase"}]
        if bags:
            for bag in bags:
                bx = (bag["bbox"][0] + bag["bbox"][2]) / 2
                by = (bag["bbox"][1] + bag["bbox"][3]) / 2
                near = any(
                    ((bx - (p["bbox"][0]+p["bbox"][2])/2)**2 + (by - (p["bbox"][1]+p["bbox"][3])/2)**2)**0.5 < frame.shape[1] * 0.2
                    for p in people
                )
                if not near:
                    return True, f"Objeto abandonado: {bag['class']}"

    elif b == "vehicle_pedestrian":
        vehicles = [d for d in dets if d["class"] in {"car", "truck", "motorcycle", "bus"}]
        if vehicles:
            return True, f"{vehicles[0]['class']} em area de pedestre"

    elif b == "animal_detection":
        animals = [d for d in dets if d["class"] in {"cat", "dog", "bird", "horse", "cow"}]
        if animals:
            return True, f"Animal detectado: {animals[0]['class']}"

    return False, ""


def _in_polygon(point, polygons):
    x, y = point
    for poly in polygons:
        pts = np.array(poly, dtype=np.float32)
        if cv2.pointPolygonTest(pts, (x, y), False) >= 0:
            return True
    return False


@app.task(name="edge.start_all_cameras")
def start_all_cameras():
    """Start processing all cameras from config."""
    config = _load_config()
    for cam in config.get("cameras", []):
        process_camera.delay(cam["id"])
        log.info(f"Started camera {cam['id']}: {cam['name']}")
