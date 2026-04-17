#!/bin/bash
# =============================================================
# init-ssl.sh — Gera o certificado Let's Encrypt pela 1ª vez
# Execute UMA VEZ antes de subir os containers em produção
# =============================================================

DOMAIN="visionalert.com.br"
EMAIL="seu@email.com"   # <-- ALTERE para seu e-mail real

echo ""
echo "[1/3] Subindo nginx em HTTP para validação do domínio..."
docker compose -f docker-compose-prod.yml up -d nginx

echo ""
echo "[2/3] Aguardando nginx iniciar..."
sleep 5

echo ""
echo "[3/3] Gerando certificado SSL para $DOMAIN e www.$DOMAIN..."
docker compose -f docker-compose-prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo ""
echo "Certificado gerado! Subindo todos os serviços..."
docker compose -f docker-compose-prod.yml up -d

echo ""
echo "Pronto! Acesse: https://www.$DOMAIN"
