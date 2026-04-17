"""
Registra o edge device no servidor central.

O setup.sh agora exige --provision-token, que deve bater com
FLEET_PROVISION_TOKEN no backend. Sem isso, o endpoint público de registro
retorna 401.

Uso:
  python agent/register.py \
      --central https://app.visionalert.com.br \
      --tenant-id 1 \
      --name "Loja Centro" \
      --provision-token "SEGREDO_DO_BACKEND"
"""
import argparse
import os
import subprocess
import sys

import requests


def get_gpu_model():
    try:
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5
        )
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def get_cpu_model():
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if "model name" in line:
                    return line.split(":", 1)[1].strip()
    except Exception:
        return ""
    return ""


def get_ram_gb():
    try:
        import psutil
        return round(psutil.virtual_memory().total / 1024 ** 3, 1)
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Register edge device")
    parser.add_argument("--central", required=True)
    parser.add_argument("--tenant-id", required=True, type=int)
    parser.add_argument("--name", required=True)
    parser.add_argument(
        "--provision-token", required=True,
        help="Token de provisionamento — igual a FLEET_PROVISION_TOKEN no backend"
    )
    args = parser.parse_args()

    print("\n" + "=" * 50)
    print("  VisionAlert Edge — Registro")
    print("=" * 50 + "\n")

    gpu = get_gpu_model()
    cpu = get_cpu_model()
    ram = get_ram_gb()

    print(f"  GPU: {gpu or 'Nao detectada'}")
    print(f"  CPU: {cpu or 'Desconhecido'}")
    print(f"  RAM: {ram}GB" if ram else "  RAM: Desconhecido")
    print()

    try:
        response = requests.post(
            f"{args.central}/api/fleet/register/",
            json={
                "tenant_id": args.tenant_id,
                "name": args.name,
                "gpu_model": gpu,
                "cpu_model": cpu,
                "ram_total_gb": ram,
            },
            headers={"X-Provision-Token": args.provision_token},
            timeout=15,
        )
    except requests.RequestException as e:
        print(f"  ERRO de conexão: {e}")
        sys.exit(2)

    if response.status_code == 201:
        data = response.json()
        device_id = data["device_id"]
        api_key = data["api_key"]

        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        with open(env_path, "a") as f:
            f.write(f"\n# VisionAlert Edge — registrado em {subprocess.check_output(['date']).decode().strip()}\n")
            f.write(f"DEVICE_KEY={api_key}\n")
            f.write(f"CENTRAL_URL={args.central}\n")
            f.write(f"DEVICE_ID={device_id}\n")

        print("  Dispositivo registrado.")
        print(f"  Device ID: {device_id}")
        print(f"  Chave salva em: {env_path}")
        print(f"\n  Proximo passo: docker compose up -d")
    else:
        print(f"  ERRO: HTTP {response.status_code}")
        print(f"  Corpo: {response.text}")
        sys.exit(1)

    print()


if __name__ == "__main__":
    main()
