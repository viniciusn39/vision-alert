from rest_framework import serializers
from .models import AlertRule, Alert

class AlertRuleSerializer(serializers.ModelSerializer):
    behavior_display = serializers.CharField(source="get_behavior_display", read_only=True)
    severity_display = serializers.CharField(source="get_severity_display", read_only=True)

    class Meta:
        model  = AlertRule
        fields = ["id","name","behavior","behavior_display","cameras","severity","severity_display",
                  "is_active","params","channels","webhook_url","cooldown_seconds","created_at"]
        extra_kwargs = {"tenant": {"read_only": True}}

class AlertSerializer(serializers.ModelSerializer):
    rule_name       = serializers.CharField(source="rule.name",            read_only=True)
    rule_severity   = serializers.CharField(source="rule.severity",        read_only=True)
    behavior        = serializers.CharField(source="rule.behavior",        read_only=True)
    camera_name     = serializers.CharField(source="camera.name",          read_only=True)
    camera_location = serializers.CharField(source="camera.location",      read_only=True)
    snapshot_url    = serializers.SerializerMethodField()

    class Meta:
        model  = Alert
        fields = ["id","rule","rule_name","rule_severity","behavior","camera","camera_name",
                  "camera_location","status","description","snapshot_url","detection_data",
                  "triggered_at","resolved_at","notified"]

    def get_snapshot_url(self, obj):
        if obj.snapshot:
            return obj.snapshot.url  # retorna /media/... direto
        return None
