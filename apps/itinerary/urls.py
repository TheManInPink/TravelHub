from rest_framework.routers import DefaultRouter

from .views import ActivityViewSet, DestinationViewSet

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("destinations", DestinationViewSet, basename="destination")
router.register("activities", ActivityViewSet, basename="activity")

urlpatterns = router.urls
