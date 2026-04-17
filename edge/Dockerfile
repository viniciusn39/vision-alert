FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Pre-download YOLO model
RUN python3 -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Disable YOLO telemetry
RUN python3 -c "from ultralytics import settings; settings.update({'sync': False, 'clearml': False, 'comet': False, 'dvc': False, 'mlflow': False, 'neptune': False, 'raytune': False, 'tensorboard': False, 'wandb': False})"

COPY . .

CMD ["python3", "agent/sync.py"]
