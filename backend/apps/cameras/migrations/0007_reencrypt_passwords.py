"""
Re-criptografa senhas de câmeras do esquema antigo (Fernet derivado da
SECRET_KEY) para o novo (Fernet com CAMERA_ENCRYPTION_KEY + prefixo enc:v1:).

IMPORTANTE: Antes de rodar esta migração, defina tanto a SECRET_KEY ORIGINAL
quanto a nova CAMERA_ENCRYPTION_KEY no ambiente. A migração lê com a antiga
e grava com a nova.

Se SECRET_KEY já foi trocada, senhas antigas não poderão ser recuperadas —
a migração vai marcar o campo como vazio e logar um aviso (o operador
precisa reentrar as credenciais no admin).
"""
import base64
import hashlib
import logging
from django.db import migrations
from django.conf import settings

logger = logging.getLogger(__name__)


def _legacy_fernet():
    """Fernet derivado da SECRET_KEY (esquema antigo)."""
    from cryptography.fernet import Fernet
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def forwards(apps, schema_editor):
    from cryptography.fernet import InvalidToken
    from apps.cameras.crypto import encrypt_value, PREFIX

    Camera = apps.get_model("cameras", "Camera")
    legacy = _legacy_fernet()
    migrated = 0
    failed   = 0
    skipped  = 0

    for cam in Camera.objects.exclude(password="").iterator():
        pwd = cam.password

        # Já no novo esquema: ignorar
        if pwd.startswith(PREFIX):
            skipped += 1
            continue

        plaintext = None

        # Tentar decifrar com o esquema antigo (começa com 'gAAAAA')
        if pwd.startswith("gAAAAA"):
            try:
                plaintext = legacy.decrypt(pwd.encode()).decode()
            except InvalidToken:
                logger.warning(
                    "Camera %s: não foi possível decifrar senha legada. "
                    "Credencial será limpa — reentre no admin.", cam.id
                )
                cam.password = ""
                cam.save(update_fields=["password"])
                failed += 1
                continue
        else:
            # Plaintext legado (antes da criptografia) — usa direto
            plaintext = pwd

        cam.password = encrypt_value(plaintext)
        cam.save(update_fields=["password"])
        migrated += 1

    logger.info(
        "Re-cifragem: %d migradas, %d pulos, %d falhas",
        migrated, skipped, failed
    )


def backwards(apps, schema_editor):
    # Não reversível — chaves antigas podem ter sido descartadas.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("cameras", "0006_alter_camera_password"),
    ]
    operations = [
        migrations.RunPython(forwards, backwards),
    ]
