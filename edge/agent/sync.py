"""
VisionAlert Edge Agent
Runs on the mini PC at the client site.
Handles: config sync, heartbeat, alert reporting, metric reporting.
"""
import os
import json
import time
import logging
import requests
import threading
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("edge-agent")

CENTRAL_URL = os.environ.get("CENTRAL_URL", "https://app.visionalert.com.br")
DEVICE_KEY = os.environ.get("DEVICE_KEY", "")
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", "60"))
SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL", "30"))
VERSION = "1.0.0"

# Queues for async reporting
_alert_queue = []
_metric_queue = []
_visitor_queue = []
_log_queue = []
_config_cache = {}


def _headers():
    return {"X-Device-Key": DEVICE_KEY, "Content-Type": "application/json"}


def _post(endpoint, data):
    try:
        r = requests.post(f"{CENTRAL_URL}/api/fleet/{endpoint}", json=data, headers=_headers(), timeout=15)
        if r.status_code == 401:
            log.error("API key invalida! Verifique DEVICE_KEY.")
        return r
    except requests.exceptions.ConnectionError:
        log.warning(f"Central offline — {endpoint} ficara em fila")
        return None
    except Exception as e:
        log.error(f"Erro ao enviar {endpoint}: {e}")
        return None


def _get(endpoint):
    try:
        r = requests.get(f"{CENTRAL_URL}/api/fleet/{endpoint}", headers=_headers(), timeout=15)
        return r
    except Exception as e:
        log.error(f"Erro ao buscar {endpoint}: {e}")
        return None


def get_system_info():
    """Collect hardware info for heartbeat."""
    info = {"version": VERSION}
    try:
        import psutil
        info["cpu_percent"] = psutil.cpu_percent(interval=0.5)
        info["ram_percent"] = psutil.virtual_memory().percent
        info["ram_total_gb"] = round(psutil.virtual_memory().total / 1024**3, 1)
        info["disk_percent"] = psutil.disk_usage("/").percent
        info["disk_total_gb"] = round(psutil.disk_usage("/").total / 1024**3, 1)
        info["uptime_seconds"] = int(time.time() - psutil.boot_time())
        info["cpu_model"] = open("/proc/cpuinfo").read().split("model name")[1].split("\n")[0].strip(": \t") if os.path.exists("/proc/cpuinfo") else ""
    except Exception:
        pass

    try:
        import subprocess
        result = subprocess.run(["nvidia-smi", "--query-gpu=name,utilization.gpu",
                                "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            parts = result.stdout.strip().split(", ")
            info["gpu_model"] = parts[0]
            info["gpu_percent"] = float(parts[1])
    except Exception:
        pass

    # Camera stats from local Redis
    try:
        import redis
        r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))
        info["cameras_active"] = int(r.get("cameras_active") or 0)
        info["cameras_total"] = int(r.get("cameras_total") or 0)
    except Exception:
        pass

    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        info["local_ip"] = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    return info


def send_heartbeat():
    """Send heartbeat to central every HEARTBEAT_INTERVAL seconds."""
    while True:
        try:
            info = get_system_info()
            r = _post("heartbeat/", info)
            if r and r.status_code == 200:
                log.debug("Heartbeat OK")
            else:
                log.warning(f"Heartbeat failed: {r.status_code if r else 'no response'}")
        except Exception as e:
            log.error(f"Heartbeat error: {e}")
        time.sleep(HEARTBEAT_INTERVAL)


def sync_config():
    """Pull configuration from central every SYNC_INTERVAL seconds."""
    global _config_cache
    while True:
        try:
            r = _get("sync/")
            if r and r.status_code == 200:
                new_config = r.json()
                if new_config != _config_cache:
                    _config_cache = new_config
                    # Write config to file for Celery workers to read
                    config_path = "/app/config/current_config.json"
                    os.makedirs(os.path.dirname(config_path), exist_ok=True)
                    with open(config_path, "w") as f:
                        json.dump(new_config, f, default=str)
                    log.info(f"Config atualizada: {len(new_config.get('cameras', []))} cameras, "
                             f"{len(new_config.get('rules', []))} regras")
                else:
                    log.debug("Config sem alteracoes")
        except Exception as e:
            log.error(f"Sync error: {e}")
        time.sleep(SYNC_INTERVAL)


def flush_alerts():
    """Send queued alerts to central."""
    global _alert_queue
    while True:
        if _alert_queue:
            batch = _alert_queue[:10]
            _alert_queue = _alert_queue[10:]
            for alert_data in batch:
                r = _post("alert/", alert_data)
                if not r or r.status_code >= 400:
                    _alert_queue.append(alert_data)  # retry later
                    break
        time.sleep(2)


def flush_metrics():
    """Send queued metrics to central in batches."""
    global _metric_queue
    while True:
        if _metric_queue:
            batch = _metric_queue[:50]
            _metric_queue = _metric_queue[50:]
            r = _post("metrics/", {"metrics": batch})
            if not r or r.status_code >= 400:
                _metric_queue.extend(batch)
        time.sleep(10)


def flush_visitors():
    """Send visitor counts to central."""
    global _visitor_queue
    while True:
        if _visitor_queue:
            batch = _visitor_queue[:20]
            _visitor_queue = _visitor_queue[20:]
            for v in batch:
                _post("visitors/", v)
        time.sleep(15)


# ── Public API (called by Celery workers) ─────────────────────────────────────

def queue_alert(rule_id, camera_id, description, detection_data, snapshot_b64=None):
    """Queue an alert to be sent to central."""
    _alert_queue.append({
        "rule_id": rule_id,
        "camera_id": camera_id,
        "description": description,
        "detection_data": detection_data,
        "snapshot_b64": snapshot_b64,
    })


def queue_metric(camera_id, metric_type, value):
    """Queue a metric to be sent to central."""
    _metric_queue.append({
        "camera_id": camera_id,
        "metric_type": metric_type,
        "value": value,
    })


def queue_visitor_count(camera_id, entries=0, exits=0):
    """Queue visitor count update."""
    _visitor_queue.append({
        "camera_id": camera_id,
        "entries": entries,
        "exits": exits,
    })


def get_config():
    """Get current cached config (used by Celery workers)."""
    if _config_cache:
        return _config_cache
    config_path = "/app/config/current_config.json"
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return {}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not DEVICE_KEY:
        log.error("DEVICE_KEY nao configurada! Execute: python agent/register.py")
        return

    log.info(f"VisionAlert Edge Agent v{VERSION}")
    log.info(f"Central: {CENTRAL_URL}")
    log.info(f"Heartbeat: {HEARTBEAT_INTERVAL}s | Sync: {SYNC_INTERVAL}s")

    threads = [
        threading.Thread(target=send_heartbeat, daemon=True, name="heartbeat"),
        threading.Thread(target=sync_config, daemon=True, name="sync"),
        threading.Thread(target=flush_alerts, daemon=True, name="alerts"),
        threading.Thread(target=flush_metrics, daemon=True, name="metrics"),
        threading.Thread(target=flush_visitors, daemon=True, name="visitors"),
    ]

    for t in threads:
        t.start()
        log.info(f"Thread {t.name} started")

    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Agent stopped")


if __name__ == "__main__":
    main()
