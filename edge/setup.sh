#!/bin/bash
# VisionAlert Edge — Setup Script
# Run this on the mini PC at the client site
#
# Usage: bash setup.sh --central https://app.visionalert.com.br --tenant-id 1 --name "Loja Centro"

set -e

echo ""
echo "========================================"
echo "  VisionAlert Edge — Instalacao"
echo "========================================"
echo ""

# Parse args
CENTRAL=""
TENANT_ID=""
NAME=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --central) CENTRAL="$2"; shift 2;;
        --tenant-id) TENANT_ID="$2"; shift 2;;
        --name) NAME="$2"; shift 2;;
        *) echo "Arg desconhecido: $1"; exit 1;;
    esac
done

if [ -z "$CENTRAL" ] || [ -z "$TENANT_ID" ] || [ -z "$NAME" ]; then
    echo "Uso: bash setup.sh --central URL --tenant-id ID --name NOME"
    echo ""
    echo "Exemplo:"
    echo "  bash setup.sh --central https://app.visionalert.com.br --tenant-id 1 --name \"Loja Centro\""
    exit 1
fi

# 1. Check Docker
echo "[1/5] Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo "  Docker nao encontrado. Instalando..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "  Docker instalado. Faca logout e login antes de continuar."
    exit 1
fi
echo "  Docker OK: $(docker --version)"

# 2. Check NVIDIA
echo "[2/5] Verificando GPU NVIDIA..."
if command -v nvidia-smi &> /dev/null; then
    GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo "")
    echo "  GPU: $GPU"
else
    echo "  AVISO: nvidia-smi nao encontrado."
    echo "  Instale NVIDIA drivers + Container Toolkit:"
    echo "  https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
fi

# 3. Check NVIDIA Container Toolkit
echo "[3/5] Verificando NVIDIA Container Toolkit..."
if docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
    echo "  NVIDIA Container Toolkit OK"
else
    echo "  AVISO: GPU nao acessivel pelo Docker."
    echo "  Instale: sudo apt install nvidia-container-toolkit && sudo systemctl restart docker"
fi

# 4. Register device
echo "[4/5] Registrando dispositivo..."
pip3 install requests psutil 2>/dev/null || pip install requests psutil 2>/dev/null
python3 agent/register.py --central "$CENTRAL" --tenant-id "$TENANT_ID" --name "$NAME"

# 5. Start
echo "[5/5] Iniciando containers..."
docker compose up -d --build

echo ""
echo "========================================"
echo "  Instalacao concluida!"
echo "========================================"
echo ""
echo "  Status:  docker compose ps"
echo "  Logs:    docker compose logs -f"
echo "  Parar:   docker compose down"
echo ""
