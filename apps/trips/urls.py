from rest_framework.routers import DefaultRouter

from .views import TripViewSet

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("trips", TripViewSet, basename="trip")

urlpatterns = router.urls
