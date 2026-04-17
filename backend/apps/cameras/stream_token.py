"""
Tokens curtos para autorizar acesso ao stream MJPEG.

Motivação: o JWT de sessão do usuário (30 min de vida) NÃO deve trafegar em
query string do <img src="">:
  - Vaza em logs de acesso do nginx/proxy
  - Fica no histórico do navegador
  - Pode vazar via header Referer

Fluxo:
  1. Frontend chama POST /api/cameras/<id>/stream-token/ (com Authorization JWT).
  2. Backend retorna um token HMAC válido por 60s para AQUELA câmera e usuário.
  3. Frontend abre <img src="/api/cameras/<id>/stream/?st=<token>">.
  4. CameraLiveStreamView valida o HMAC + expiração.

Esse token só serve para abrir o stream dessa câmera; se vazar, o dano é
limitado à janela de 60s e à câmera específica.
"""
import hmac
import hashlib
import time
import base64
import json
from django.conf import settings


TOKEN_TTL_SECONDS = 60


def _secret() -> bytes:
    return settings.STREAM_TOKEN_SECRET.encode()


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def issue(user_id: int, camera_id: int, ttl: int = TOKEN_TTL_SECONDS) -> str:
    """Emite um token assinado para user+camera, com TTL em segundos."""
    payload = {
        "u": int(user_id),
        "c": int(camera_id),
        "e": int(time.time()) + ttl,
    }
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(_secret(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64e(sig)}"


def verify(token: str, user_id: int, camera_id: int) -> bool:
    """
    Valida o token. Retorna True se:
      - assinatura confere com STREAM_TOKEN_SECRET
      - não expirou
      - u == user_id e c == camera_id
    """
    if not token or "." not in token:
        return False
    try:
        body, sig_b64 = token.split(".", 1)
        expected = hmac.new(_secret(), body.encode(), hashlib.sha256).digest()
        given = _b64d(sig_b64)
        if not hmac.compare_digest(expected, given):
            return False
        payload = json.loads(_b64d(body))
        if payload.get("u") != int(user_id):
            return False
        if payload.get("c") != int(camera_id):
            return False
        if int(payload.get("e", 0)) < int(time.time()):
            return False
        return True
    except Exception:
        return False
