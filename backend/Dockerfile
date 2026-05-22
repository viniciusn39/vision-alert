FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install torch==2.5.1 torchvision==0.20.1 \
        --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt

COPY . .

# remove o yolov8n.pt vazio do COPY e baixa o modelo real, fora do volume
RUN rm -f yolov8n.pt \
    && python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" \
    && cp yolov8n.pt /opt/yolov8n.pt

CMD ["sh", "entrypoint.sh"]
