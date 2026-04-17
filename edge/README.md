# VisionAlert Edge

Módulo que roda no mini PC instalado no cliente.
Processa câmeras localmente com YOLO + GPU e envia apenas alertas e métricas para o servidor central.

## Requisitos do hardware

- Mini PC com NVIDIA GPU (RTX 3060 ou superior)
- Ubuntu 22.04 ou 24.04
- Docker + NVIDIA Container Toolkit
- Acesso à internet (saída, porta 443)
- Rede local com acesso ao DVR/NVR do cliente

## DVRs compatíveis

| Marca | Modelos testados | URL RTSP |
|---|---|---|
| Intelbras | MHDX 1004/1008/1016/3004/3008, NVD 1304/1308 | `rtsp://user:pass@ip:554/cam/realmonitor?channel=N&subtype=0` |
| Hikvision | DS-7204/7208/7216 | `rtsp://user:pass@ip:554/Streaming/Channels/N01` |
| Dahua | DH-XVR5104/5108/5116 | `rtsp://user:pass@ip:554/cam/realmonitor?channel=N&subtype=0` |
| Giga Security | GS0480/GS0481 | `rtsp://user:pass@ip:554/cam/realmonitor?channel=N&subtype=0` |
| JFL | DHD-2104N/2108N | `rtsp://user:pass@ip:7070/channel=N` |
| Tecvoz | TW-E304/308/316 | `rtsp://user:pass@ip:554/Streaming/Channels/N01` |

> N = número do canal (1, 2, 3...). subtype=0 = stream principal, subtype=1 = substream.
> Qualquer DVR/NVR com suporte ONVIF é compatível.

## Instalação

```bash
# Na máquina do cliente:
git clone https://github.com/seuusuario/visionalert-edge.git
cd visionalert-edge

bash setup.sh \
  --central https://app.visionalert.com.br \
  --tenant-id 1 \
  --name "Loja Centro"
```

## Atualizações

As atualizações são automáticas via Watchtower.
Quando você faz `docker push` de uma nova imagem, todas as máquinas em campo atualizam em até 5 minutos.

## Estrutura

```
edge/
├── agent/
│   ├── sync.py          # Agent principal (heartbeat, config sync, report)
│   └── register.py      # Script de registro (roda 1x na instalação)
├── edge_worker.py       # Celery worker (YOLO + processamento de câmeras)
├── docker-compose.yml   # Compose para deploy no cliente
├── Dockerfile           # Container com CUDA + YOLO
├── requirements.txt
├── setup.sh             # Script de instalação automatizada
└── .env.example
```
