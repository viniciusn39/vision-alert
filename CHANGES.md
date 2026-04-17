# VisionAlert — Correções Críticas Aplicadas

Este zip contém o projeto com as correções críticas da análise aplicadas.
**Não é deploy-ready plug-and-play** — você precisa gerar novos segredos e
rodar as migrations.

## 🔐 Passos OBRIGATÓRIOS antes de subir

### 1. Gerar segredos novos (o `.env` original vazou no repo)

```bash
# DJANGO_SECRET_KEY (64+ chars)
python -c "import secrets; print(secrets.token_urlsafe(64))"

# CAMERA_ENCRYPTION_KEY (Fernet)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# STREAM_TOKEN_SECRET
python -c "import secrets; print(secrets.token_urlsafe(48))"

# FLEET_PROVISION_TOKEN
python -c "import secrets; print(secrets.token_urlsafe(32))"

# ASAAS_WEBHOOK_TOKEN (se não tiver)
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copie `.env.example` para `.env` e preencha.

### 2. Rodar as duas migrations novas

```bash
# Re-cifra senhas de câmera com a nova CAMERA_ENCRYPTION_KEY.
# Precisa da SECRET_KEY ORIGINAL no ambiente para conseguir decifrar as antigas.
# Se já trocou a SECRET_KEY, as senhas antigas serão zeradas (reentre no admin).
docker compose run --rm backend python manage.py migrate cameras

# Hasheia api_keys existentes dos edge devices.
docker compose run --rm backend python manage.py migrate fleet
```

### 3. No Asaas

- Configure a allowlist de IPs do webhook em `ASAAS_WEBHOOK_IP_ALLOWLIST`
  (consulte a documentação do Asaas para os IPs atuais).

### 4. Edge devices em produção

Se você já tem dispositivos rodando em campo:

- As api_keys **continuam válidas** (foram hasheadas, mas o lookup por hash
  funciona com a chave original que o edge mantém no `.env` local).
- Se quiser rotacionar por segurança: use o endpoint novo
  `POST /api/fleet/admin/devices/<uuid>/rotate-key/` e atualize o `.env`
  no dispositivo.

Para novos dispositivos, `setup.sh` agora exige `--provision-token`:

```bash
bash setup.sh \
  --central https://app.seudominio.com \
  --tenant-id 1 \
  --name "Loja Centro" \
  --provision-token <FLEET_PROVISION_TOKEN>
```

## 🧭 O que mudou

### Segurança — críticos resolvidos
- `.env` removido do repo; `.env.example` adicionado.
- `CAMERA_ENCRYPTION_KEY` dedicada, separada da `SECRET_KEY`.
- Prefixo `enc:v1:` explícito em senhas cifradas (substitui heurística `gAAAAA`).
- `decrypt_value` não mascara mais falha retornando ciphertext.
- Stream-token HMAC curto (60s, amarrado a user+câmera) — JWT de sessão
  sai da query string do MJPEG.
- `CameraLiveStreamView` com limite por usuário/global via Redis + YOLO
  singleton + timeout configurável.
- `RegisterDeviceView` exige `X-Provision-Token`; sem token configurado,
  endpoint fica desabilitado.
- `EdgeDevice.api_key` substituído por `api_key_hash` (SHA256) + `api_key_prefix`.
- `SyncConfigView` sem N+1; senhas RTSP cifradas com AES-GCM derivada da api_key.
- Webhook Asaas: IP allowlist + constant-time compare + **double-check via GET**
  antes de marcar pagamento.
- JWT lifetime reduzido: 8h → 30min (com refresh automático no frontend).

### Correções de bugs
- `create_subscription_and_first_invoice` de fato cria a Invoice.
- Cooldown de regras em Redis (funciona com múltiplos workers Celery).
- Tracking de line-crossing em Redis com TTL.
- Lock distribuído em `start_camera_processing` — evita duplicar VideoCapture.
- Pre-warm do YOLO no worker ready.
- `_claude_vision` extrai JSON mesmo com fences de markdown.
- `YouTubeDownload` valida via `urlparse` + whitelist de hosts + `--` separator.
- Uploads isolados por tenant (`/tmp/camera_uploads/tenant_<id>/`).
- Limite de câmera no plano com `select_for_update` (race-free).

### Frontend
- `auth.interceptor.ts` injeta `Authorization` só em URLs da nossa API.
- Refresh automático de JWT em 401, coordenado entre requests concorrentes.
- `camera-live.component.ts` e `cameras.component.ts` pedem stream-token
  antes de abrir o `<img>` do MJPEG.

### Config
- `CORS_ALLOWED_ORIGINS` via env.
- Password validators completos (antes só minlen).
- Throttling DRF (anon 30/min, user 300/min).
- `SECURE_*` flags + HSTS quando `DEBUG=False`.
- `CELERY_RESULT_EXPIRES=24h`.
- Logging padronizado.

### Kit de 5 ícones (novo)
- `favicon.ico` (multi-res 16+32)
- `favicon-16.png`, `favicon-32.png`
- `apple-touch-icon.png` (180×180)
- `icon-192.png`, `icon-512.png` (PWA)
- `icon.svg` (base vetorial)
- `manifest.webmanifest` com `theme_color=#1D9E75`

Referenciados no `index.html` e incluídos em `angular.json → assets`.

## ⚠️ O que NÃO foi corrigido (fora do escopo de "crítico")

Problemas arquiteturais grandes que precisam de decisão de produto + sprints:

1. **Processamento de câmera no backend bloqueia slot Celery.** Continua
   como estava. A arquitetura certa é mover o processamento inteiramente
   para o edge worker (já existe, só precisa ser a única fonte). Hoje
   backend e edge fazem a mesma coisa.
2. **Edge worker ignora filas do agent** — `_report_alert` chama central
   direto via HTTP. Alertas se perdem se central estiver offline.
   Precisa unificar em Redis pub/sub local.
3. **Cooldown de regras no edge worker** ainda é dict local. Aplique o
   mesmo padrão do backend (Redis) se forem manter os dois.
4. Watchtower auto-update sem canary deploy — em produção real, troque
   por pipeline com deploy em anel.

## Estrutura de arquivos alterados

```
.env                                    [REMOVIDO]
.env.example                            [NOVO]
.gitignore                              [reforçado]
backend/config/settings.py              [reescrito]
backend/apps/cameras/crypto.py          [reescrito]
backend/apps/cameras/models.py          [save + get_stream_url corrigidos]
backend/apps/cameras/stream_token.py    [NOVO]
backend/apps/cameras/views.py           [reescrito]
backend/apps/cameras/tasks.py           [reescrito]
backend/apps/cameras/migrations/0007_reencrypt_passwords.py   [NOVO]
backend/apps/fleet/models.py            [api_key_hash]
backend/apps/fleet/views.py             [reescrito]
backend/apps/fleet/urls.py              [+rotate-key]
backend/apps/fleet/migrations/0002_hash_api_keys.py           [NOVO]
backend/apps/billing/views.py           [reescrito]
backend/apps/billing/tasks.py           [reescrito]
frontend/src/app/core/interceptors/auth.interceptor.ts        [reescrito]
frontend/src/app/core/services/auth.service.ts                [reescrito + refresh]
frontend/src/app/core/services/api.service.ts                 [+stream-token]
frontend/src/app/features/tenant/cameras/components/camera-live.component.ts [reescrito]
frontend/src/app/features/tenant/cameras/cameras.component.ts [openLive ajustado]
frontend/src/index.html                 [kit de ícones]
frontend/src/manifest.webmanifest       [NOVO]
frontend/src/favicon.ico                [regenerado]
frontend/src/assets/icons/*.png         [NOVO — 5 tamanhos]
frontend/src/assets/icons/icon.svg      [NOVO]
frontend/angular.json                   [+assets no build]
edge/agent/register.py                  [+ --provision-token]
edge/setup.sh                           [+ --provision-token]
```

## Validação rápida

```bash
# Confere que o backend não quebra no startup
docker compose up backend

# Testa o refresh token
curl -X POST http://localhost:8000/api/auth/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{"refresh":"<seu_refresh_aqui>"}'

# Testa o stream-token
curl -X POST http://localhost:8000/api/cameras/1/stream-token/ \
  -H "Authorization: Bearer <jwt>"

# Confere que o register fleet sem token é rejeitado
curl -X POST http://localhost:8000/api/fleet/register/ \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"name":"teste"}'
# → 403 Forbidden (antes retornava 201 com a api_key)
```
