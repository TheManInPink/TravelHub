"""Routage principal de TravelHub."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

admin.site.site_header = "TravelHub — administration"
admin.site.site_title = "TravelHub"
admin.site.index_title = "Gestion des données"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.trips.urls")),
    path("api/", include("apps.itinerary.urls")),
    # Documentation OpenAPI, publique : SPECTACULAR_SETTINGS["SERVE_PERMISSIONS"] vaut AllowAny.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
