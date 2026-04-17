#!/bin/bash
# =============================================================
# deploy-prod.sh — Atualiza o Vision Alert em produção
# Uso: sudo ./deploy-prod.sh
# =============================================================
set -e

PROJECT_DIR="/opt/vision-alert"
COMPOSE="docker compose -f docker-compose-prod.yml"

echo ""
echo "========================================"
echo "  Vision Alert — Deploy de Atualização"
echo "========================================"

cd "$PROJECT_DIR"

echo ""
echo "[1/5] Atualizando código..."
git pull

echo ""
echo "[2/5] Rebuild do frontend sem cache..."
$COMPOSE build --no-cache frontend

echo ""
echo "[3/5] Parando containers..."
$COMPOSE stop frontend nginx

echo ""
echo "[4/5] Recriando volume do frontend..."
docker volume rm vision-alert_frontend_build 2>/dev/null || true
$COMPOSE up -d --force-recreate frontend

echo ""
echo "[5/5] Reiniciando nginx..."
$COMPOSE up -d --force-recreate nginx

echo ""
echo "========================================"
echo "  Deploy concluído!"
echo "  Acesse: https://visionalert.com.br"
echo "========================================"
