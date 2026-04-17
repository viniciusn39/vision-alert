#!/bin/bash
# VisionAlert Edge — Setup Script
#
# Uso:
#   bash setup.sh \
#     --central https://app.visionalert.com.br \
#     --tenant-id 1 \
#     --name "Loja Centro" \
#     --provision-token SEGREDO
#
# O provision-token deve bater com FLEET_PROVISION_TOKEN no backend central.
# Peça ao seu admin. Sem ele, o registro é negado (401).

set -e

CENTRAL=""
TENANT_ID=""
NAME=""
PROVISION_TOKEN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --central) CENTRAL="$2"; shift 2;;
        --tenant-id) TENANT_ID="$2"; shift 2;;
        --name) NAME="$2"; shift 2;;
        --provision-token) PROVISION_TOKEN="$2"; shift 2;;
        *) echo "Arg desconhecido: $1"; exit 1;;
    esac
done

if [ -z "$CENTRAL" ] || [ -z "$TENANT_ID" ] || [ -z "$NAME" ] || [ -z "$PROVISION_TOKEN" ]; then
    echo "Uso: bash setup.sh --central URL --tenant-id ID --name NOME --provision-token TOKEN"
    echo ""
    echo "O provision-token deve ser obtido com o admin do sistema (ver FLEET_PROVISION_TOKEN)."
    exit 1
fi

echo ""
echo "========================================"
echo "  VisionAlert Edge — Instalacao"
echo "========================================"
echo ""

# 1. Docker
echo "[1/5] Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo "  Docker nao encontrado. Instalando..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "  Faca logout e login antes de continuar."
    exit 1
fi
echo "  Docker OK: $(docker --version)"

# 2. GPU
echo "[2/5] Verificando GPU NVIDIA..."
if command -v nvidia-smi &> /dev/null; then
    GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo "")
    echo "  GPU: $GPU"
else
    echo "  AVISO: nvidia-smi nao encontrado."
fi

# 3. NVIDIA Container Toolkit
echo "[3/5] Verificando NVIDIA Container Toolkit..."
if docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
    echo "  OK"
else
    echo "  AVISO: GPU nao acessivel pelo Docker."
    echo "  Instale: sudo apt install nvidia-container-toolkit && sudo systemctl restart docker"
fi

# 4. Registro
echo "[4/5] Registrando dispositivo..."
pip3 install --quiet requests psutil 2>/dev/null || pip install --quiet requests psutil 2>/dev/null
python3 agent/register.py \
    --central "$CENTRAL" \
    --tenant-id "$TENANT_ID" \
    --name "$NAME" \
    --provision-token "$PROVISION_TOKEN"

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
echo ""
