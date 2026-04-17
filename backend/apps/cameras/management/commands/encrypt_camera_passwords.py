"""
One-time migration: encrypt all camera passwords stored in plaintext.

Usage: python manage.py encrypt_camera_passwords
"""
from django.core.management.base import BaseCommand
from apps.cameras.models import Camera
from apps.cameras.crypto import encrypt_value


class Command(BaseCommand):
    help = "Encrypt all camera passwords that are currently stored in plaintext"

    def handle(self, *args, **options):
        cameras = Camera.objects.exclude(password="").exclude(password__startswith="gAAAAA")
        count = cameras.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No plaintext passwords found. All good!"))
            return

        self.stdout.write(f"Found {count} camera(s) with plaintext passwords. Encrypting...")

        for cam in cameras:
            cam.password = encrypt_value(cam.password)
            Camera.objects.filter(pk=cam.pk).update(password=cam.password)

        self.stdout.write(self.style.SUCCESS(f"Successfully encrypted {count} password(s)."))
