from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.tenants.permissions import get_tenant
from .models import Location, VisitorCount
from .serializers import LocationSerializer, VisitorCountSerializer


class LocationViewSet(viewsets.ModelViewSet):
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = get_tenant(self.request)
        return Location.objects.filter(tenant=tenant)

    def perform_create(self, serializer):
        tenant = get_tenant(self.request)
        serializer.save(tenant=tenant)

    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        """Stats for a location: visitors per day last 30d, hourly breakdown"""
        loc = self.get_object()
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Sum
        now   = timezone.now()
        since = now.date() - timedelta(days=29)

        daily = (VisitorCount.objects
                 .filter(location=loc, date__gte=since)
                 .values("date")
                 .annotate(entries=Sum("entries"), exits=Sum("exits"))
                 .order_by("date"))

        # Hourly breakdown today
        from apps.cameras.models import CameraMetric
        cams = loc.cameras.values_list("id", flat=True)
        today_metrics = (CameraMetric.objects
                         .filter(camera_id__in=cams, metric_type="people_count",
                                 timestamp__date=now.date())
                         .values("timestamp", "value"))

        from collections import defaultdict
        by_hour = defaultdict(list)
        for m in today_metrics:
            by_hour[m["timestamp"].hour].append(m["value"])
        hourly = [{"hour": h, "avg": round(sum(v)/len(v),1), "max": max(v)}
                  for h, v in sorted(by_hour.items())]

        return Response({
            "daily":  [{"date": str(d["date"]), "entries": d["entries"], "exits": d["exits"]} for d in daily],
            "hourly": hourly,
        })

    @action(detail=True, methods=["post"], url_path="assign-camera")
    def assign_camera(self, request, pk=None):
        loc = self.get_object()
        camera_id = request.data.get("camera_id")
        remove = request.data.get("remove", False)
        try:
            from apps.cameras.models import Camera
            cam = Camera.objects.get(pk=camera_id, tenant=loc.tenant)
            cam.location_obj = loc if not remove else None
            cam.save()
            return Response({"status": "ok"})
        except Exception as e:
            return Response({"detail": str(e)}, status=400)
