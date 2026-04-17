from rest_framework import serializers
from .models import Camera, CameraZone

class CameraZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CameraZone
        fields = "__all__"

class CameraSerializer(serializers.ModelSerializer):
    snapshot_url = serializers.SerializerMethodField()
    zones        = CameraZoneSerializer(many=True, read_only=True)
    class Meta:
        model  = Camera
        fields = ["id","name","location","url","protocol","username","password",
                  "is_active","status","last_seen","snapshot_url","zones","location_obj","entry_line_y","created_at"]
        extra_kwargs = {"password": {"write_only": True}, "tenant": {"read_only": True}}
    def get_snapshot_url(self, obj):
        if obj.snapshot and obj.snapshot.name:
            return obj.snapshot.url
        return None

class CameraListSerializer(serializers.ModelSerializer):
    snapshot_url = serializers.SerializerMethodField()
    class Meta:
        model  = Camera
        fields = ["id","name","location","protocol","status","last_seen","snapshot_url","is_active","location_obj","entry_line_y"]
    def get_snapshot_url(self, obj):
        if obj.snapshot and obj.snapshot.name:
            return obj.snapshot.url
        return None
