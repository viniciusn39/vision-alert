from rest_framework import serializers
from .models import Location, VisitorCount


class LocationSerializer(serializers.ModelSerializer):
    camera_count   = serializers.SerializerMethodField()
    entries_today  = serializers.SerializerMethodField()
    exits_today    = serializers.SerializerMethodField()
    inside_now     = serializers.SerializerMethodField()

    class Meta:
        model  = Location
        fields = ["id","name","address","city","state","timezone","is_active","created_at",
                  "camera_count","entries_today","exits_today","inside_now"]

    def get_camera_count(self, obj):
        try:
            return obj.cameras.count()
        except Exception:
            return 0

    def _get_vcs(self, obj):
        from django.utils import timezone
        today = timezone.now().date()
        return VisitorCount.objects.filter(location=obj, date=today)

    def get_entries_today(self, obj):
        return sum(vc.entries for vc in self._get_vcs(obj))

    def get_exits_today(self, obj):
        return sum(vc.exits for vc in self._get_vcs(obj))

    def get_inside_now(self, obj):
        return sum(max(0, vc.entries - vc.exits) for vc in self._get_vcs(obj))


class VisitorCountSerializer(serializers.ModelSerializer):
    camera_name = serializers.CharField(source="camera.name", read_only=True)
    inside_now  = serializers.SerializerMethodField()

    class Meta:
        model  = VisitorCount
        fields = ["id","camera","camera_name","location","date","entries","exits",
                  "peak_hour","peak_count","updated_at"]

    def get_inside_now(self, obj):
        return max(0, obj.entries - obj.exits)
