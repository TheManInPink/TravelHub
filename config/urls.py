"""Routage principal de TravelHub."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.core.views import TravelHubGraphQLView, health

admin.site.site_header = "TravelHub — administration"
admin.site.site_title = "TravelHub"
admin.site.index_title = "Gestion des données"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.trips.urls")),
    path("api/", include("apps.itinerary.urls")),
    # Documentation OpenAPI publique (SPECTACULAR_SETTINGS["SERVE_PERMISSIONS"] vaut AllowAny).
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    # API GraphQL, avec GraphiQL dans le navigateur en développement (GRAPHQL_GRAPHIQL).
    path("graphql/", TravelHubGraphQLView.as_view(), name="graphql"),
    # Contrôle de santé (HEALTHCHECK de l'image Docker) : base et cache.
    path("health/", health, name="health"),
]

# Les erreurs hors DRF sont aussi en JSON, sans page HTML ni trace de pile.
handler404 = "apps.core.views.not_found"
handler500 = "apps.core.views.server_error"
