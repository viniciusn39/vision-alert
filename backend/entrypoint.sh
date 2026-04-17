#!/bin/sh
set -e

echo "⏳ Aguardando banco de dados..."
python -c "
import time, os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.db import connection
for i in range(30):
    try:
        connection.ensure_connection()
        print('✅ Banco pronto')
        break
    except Exception:
        print(f'  Tentativa {i+1}/30...')
        time.sleep(2)
"

echo "📦 Executando migrations..."
python manage.py migrate --noinput

echo "📁 Static files..."
python manage.py collectstatic --noinput

# Roda seed apenas se não houver nenhum plano cadastrado (primeira vez)
PLAN_COUNT=$(python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from apps.tenants.models import Plan
print(Plan.objects.count())
")

if [ "$PLAN_COUNT" = "0" ]; then
  echo "🌱 Primeira execução — rodando seed inicial..."
  python manage.py seed
else
  echo "✅ Dados já existem (${PLAN_COUNT} planos) — seed ignorado"
fi

echo "🚀 Iniciando servidor..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
