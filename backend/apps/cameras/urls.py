from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import CameraViewSet, CameraZoneViewSet, VideoUploadView, YouTubeDownloadView, CameraDetailView, CameraLiveStreamView

router = DefaultRouter()
router.register("cameras",      CameraViewSet)
router.register("camera-zones", CameraZoneViewSet)

urlpatterns = [
    path("cameras/upload-video/", VideoUploadView.as_view()),
    path("cameras/youtube-download/", YouTubeDownloadView.as_view()),
    path("cameras/<int:pk>/detail/", CameraDetailView.as_view()),
    path("cameras/<int:pk>/stream/", CameraLiveStreamView.as_view()),
] + router.urls