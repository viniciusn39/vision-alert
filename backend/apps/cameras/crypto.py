"""
Encryption utilities for sensitive camera credentials.
Uses Fernet symmetric encryption with a key derived from Django's SECRET_KEY.
"""
import base64
import hashlib
from cryptography.fernet import Fernet
from django.conf import settings


def _get_fernet():
    """Derive a Fernet key from Django's SECRET_KEY."""
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value. Returns base64-encoded ciphertext."""
    if not plaintext:
        return ""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a previously encrypted value. Returns plaintext."""
    if not ciphertext:
        return ""
    try:
        f = _get_fernet()
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        # If decryption fails, value might be stored in plaintext (migration)
        return ciphertext
