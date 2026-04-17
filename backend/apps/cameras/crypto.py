"""
Criptografia para credenciais de câmera.

Chave dedicada (CAMERA_ENCRYPTION_KEY) — NÃO deriva da SECRET_KEY, para que
rotação de SECRET_KEY não inutilize senhas.

Prefixo explícito "enc:v1:" identifica valores cifrados. Permite migrar
para enc:v2: (outro algoritmo/chave) no futuro sem ambiguidade.

NUNCA retorne ciphertext mascarado como plaintext em falha: essa prática
produz URLs RTSP com "enc:v1:..." no lugar da senha e esconde o bug.
"""
import logging
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)

PREFIX = "enc:v1:"


class CameraCryptoError(Exception):
    """Falha de criptografia. Não silenciar — propagar e logar."""
    pass


def _fernet():
    key = settings.CAMERA_ENCRYPTION_KEY
    if not key:
        raise CameraCryptoError(
            "CAMERA_ENCRYPTION_KEY não configurada. "
            "Gere com: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as e:
        raise CameraCryptoError(f"CAMERA_ENCRYPTION_KEY inválida: {e}")


def is_encrypted(value: str) -> bool:
    """True se o valor já está cifrado com esta versão do esquema."""
    return isinstance(value, str) and value.startswith(PREFIX)


def encrypt_value(plaintext: str) -> str:
    """Cifra uma string. Retorna 'enc:v1:<base64>'. Vazio passa direto."""
    if not plaintext:
        return ""
    if is_encrypted(plaintext):
        # Já cifrado — idempotente
        return plaintext
    token = _fernet().encrypt(plaintext.encode()).decode()
    return PREFIX + token


def decrypt_value(ciphertext: str) -> str:
    """
    Decifra. Se já estiver em plaintext (campo legado sem prefixo), retorna como está.
    Se tiver prefixo mas falhar decifrar, levanta CameraCryptoError (NÃO mascara).
    """
    if not ciphertext:
        return ""
    if not is_encrypted(ciphertext):
        # Plaintext legado — o save() vai re-cifrar na próxima gravação
        return ciphertext
    token = ciphertext[len(PREFIX):]
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as e:
        logger.error("Falha ao decifrar senha de câmera — chave trocada ou valor corrompido.")
        raise CameraCryptoError("Não foi possível decifrar a senha da câmera.") from e
