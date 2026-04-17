import json, logging
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)

def _group(tenant_id):
    return f"alerts_{tenant_id}"

class AlertConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        token = query.get("token", [None])[0]
        user  = await self._auth(token)
        if not user or not user.tenant_id:
            await self.close(code=4001); return
        self.group = _group(user.tenant_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            if json.loads(text_data or "{}").get("type") == "ping":
                await self.send(text_data=json.dumps({"type":"pong"}))
        except Exception: pass

    async def alert_message(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def _auth(self, token):
        if not token: return None
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            from django.contrib.auth import get_user_model
            from asgiref.sync import sync_to_async
            access  = AccessToken(token)
            User    = get_user_model()
            return await sync_to_async(User.objects.select_related("tenant").get)(pk=access["user_id"])
        except Exception: return None


def broadcast_alert(alert):
    layer = get_channel_layer()
    async_to_sync(layer.group_send)(
        _group(alert.rule.tenant_id),
        {"type": "alert_message", "data": {
            "id":              alert.id,
            "rule_name":       alert.rule.name,
            "severity":        alert.rule.severity,
            "behavior":        alert.rule.behavior,
            "camera_name":     alert.camera.name,
            "camera_location": alert.camera.location,
            "description":     alert.description,
            "triggered_at":    alert.triggered_at.isoformat(),
            "status":          alert.status,
        }}
    )
