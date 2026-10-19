from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.openapi import (
    FORBIDDEN,
    GATEWAY_TIMEOUT,
    NOT_FOUND,
    SERVICE_UNAVAILABLE,
    THROTTLED,
    UNAUTHORIZED,
    VALIDATION_ERROR,
    ApiErrorSerializer,
    error_body,
)
from apps.core.permissions import IsTripEditor, TripRolePermissionMixin
from apps.trips.models import Trip

from .filters import ActivityFilter, DestinationFilter
from .models import Activity, Destination
from .serializers import ActivitySerializer, DestinationSerializer, DestinationWeatherSerializer
from .services import destination_forecast

COMMON_ERRORS = {401: UNAUTHORIZED, 429: THROTTLED}
OBJECT_ERRORS = {**COMMON_ERRORS, 404: NOT_FOUND}
WRITE_ERRORS = {400: VALIDATION_ERROR, 403: FORBIDDEN, **OBJECT_ERRORS}

WEATHER_NOT_FOUND = OpenApiResponse(
    response=ApiErrorSerializer,
    description="Destination introuvable, ville inconnue ou séjour hors des 16 jours de prévision",
    examples=[
        OpenApiExample("Destination introuvable", value=error_body("not_found", "Non trouvé.")),
        OpenApiExample(
            "Ville inconnue",
            value=error_body(
                "location_not_found",
                "Ville introuvable : Atlantide (GR). Vérifiez le nom et le code pays.",
            ),
        ),
        OpenApiExample(
            "Séjour trop lointain",
            value=error_body(
                "no_data_available",
                "Aucune prévision pour le 2027-04-06 au 2027-04-10 : Open-Meteo ne prévoit "
                "que les 16 prochains jours (2026-10-18 au 2026-11-02).",
            ),
        ),
    ],
)
WEATHER_EXAMPLE = OpenApiExample(
    "Météo à Kyoto",
    value={
        "destination": 3,
        "city": "Kyoto",
        "country_code": "JP",
        "latitude": "35.021070",
        "longitude": "135.753850",
        "timezone": "Asia/Tokyo",
        "units": {"temperature": "°C", "wind_speed": "km/h", "precipitation": "mm"},
        "current": {
            "time": "2026-10-19T09:15",
            "temperature": 17.4,
            "wind_speed": 6.1,
            "precipitation": 0.0,
            "weather_code": 2,
            "description": "Partiellement nuageux",
        },
        "daily": [
            {
                "date": "2026-10-20",
                "temperature_max": 21.3,
                "temperature_min": 12.8,
                "precipitation_sum": 0.4,
                "wind_speed_max": 11.2,
                "weather_code": 61,
                "description": "Pluie faible",
            }
        ],
    },
    response_only=True,
)

EDITOR_ACTIONS = {
    "create": IsTripEditor,
    "update": IsTripEditor,
    "partial_update": IsTripEditor,
    "destroy": IsTripEditor,
}


def crud_schema(name, plural, parent, serializer, examples):
    """Documentation commune aux deux ViewSets d'itinéraire."""
    write_note = (
        f"Réservé au propriétaire et aux éditeurs du voyage : 403 pour un lecteur, "
        f"404 si {parent} n'existe pas ou ne vous est pas visible."
    )
    return extend_schema_view(
        list=extend_schema(
            summary=f"Lister les {plural}",
            description=f"{plural.capitalize()} des voyages auxquels vous participez.",
            responses={200: serializer(many=True), **COMMON_ERRORS},
        ),
        create=extend_schema(
            summary=f"Créer une {name}",
            description=write_note,
            responses={201: serializer, **WRITE_ERRORS},
            examples=examples,
        ),
        retrieve=extend_schema(
            summary=f"Détail d'une {name}",
            responses={200: serializer, **OBJECT_ERRORS},
        ),
        update=extend_schema(
            summary=f"Remplacer une {name}",
            description=write_note,
            responses={200: serializer, **WRITE_ERRORS},
            examples=examples,
        ),
        partial_update=extend_schema(
            summary=f"Modifier une {name}",
            description=write_note,
            responses={200: serializer, **WRITE_ERRORS},
        ),
        destroy=extend_schema(
            summary=f"Supprimer une {name}",
            description="Réservé au propriétaire et aux éditeurs du voyage.",
            responses={204: None, 403: FORBIDDEN, **OBJECT_ERRORS},
        ),
    )


@crud_schema(
    "destination",
    "destinations",
    "le voyage",
    DestinationSerializer,
    [
        OpenApiExample(
            "Kyoto",
            value={
                "trip": 12,
                "order": 2,
                "city": "Kyoto",
                "country": "Japon",
                "country_code": "JP",
                "arrival_date": "2027-04-06",
                "departure_date": "2027-04-10",
                "latitude": "35.011600",
                "longitude": "135.768100",
            },
            request_only=True,
        ),
        OpenApiExample(
            "Arrivée avant le voyage",
            value=error_body(
                "validation_error",
                "Les données envoyées sont invalides.",
                {
                    "arrival_date": [
                        "L'arrivée ne peut pas précéder le début du voyage (2027-04-01)."
                    ]
                },
            ),
            response_only=True,
            status_codes=["400"],
        ),
    ],
)
@extend_schema(tags=["Destinations"])
class DestinationViewSet(TripRolePermissionMixin, viewsets.ModelViewSet):
    """CRUD des destinations des voyages visibles par l'utilisateur."""

    serializer_class = DestinationSerializer
    filterset_class = DestinationFilter
    search_fields = ["city", "country"]
    ordering_fields = ["order", "arrival_date", "city"]
    ordering = ["trip", "order"]
    object_permission_by_action = EDITOR_ACTIONS

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Destination.objects.none()
        visible = Trip.objects.visible_to(self.request.user)
        # select_related : les permissions objet remontent à destination.trip.
        return Destination.objects.filter(trip__in=visible).select_related("trip")

    @extend_schema(
        summary="Météo d'une destination",
        description=(
            "Conditions actuelles et prévisions quotidiennes d'Open-Meteo pour les jours du "
            "séjour compris dans les 16 prochains jours. Ouvert à tout participant. "
            "Sans coordonnées, la ville est d'abord géocodée (avec son code pays) et ses "
            "coordonnées sont enregistrées dans la destination. Réponses en cache : "
            "géocodage 7 jours, météo 30 minutes."
        ),
        responses={
            200: DestinationWeatherSerializer,
            404: WEATHER_NOT_FOUND,
            503: SERVICE_UNAVAILABLE,
            504: GATEWAY_TIMEOUT,
            **COMMON_ERRORS,
        },
        examples=[WEATHER_EXAMPLE],
    )
    @action(detail=True, methods=["get"])
    def weather(self, request, pk=None):
        destination = self.get_object()
        forecast = destination_forecast(destination)
        serializer = DestinationWeatherSerializer(
            {"destination": destination, "forecast": forecast}
        )
        return Response(serializer.data)


@crud_schema(
    "activité",
    "activités",
    "la destination",
    ActivitySerializer,
    [
        OpenApiExample(
            "Cérémonie du thé",
            value={
                "destination": 3,
                "name": "Cérémonie du thé",
                "description": "Maison de thé à Gion.",
                "category": "culture",
                "date": "2027-04-07",
                "start_time": "14:00",
                "cost": "45.00",
            },
            request_only=True,
        ),
        OpenApiExample(
            "Date hors séjour",
            value=error_body(
                "validation_error",
                "Les données envoyées sont invalides.",
                {
                    "date": [
                        "La date de l'activité doit être comprise dans le séjour à Kyoto "
                        "(2027-04-06 au 2027-04-10)."
                    ]
                },
            ),
            response_only=True,
            status_codes=["400"],
        ),
    ],
)
@extend_schema(tags=["Activités"])
class ActivityViewSet(TripRolePermissionMixin, viewsets.ModelViewSet):
    """CRUD des activités des voyages visibles par l'utilisateur.

    Sans paramètre ordering, l'ordre est chronologique (date puis heure de début).
    """

    serializer_class = ActivitySerializer
    filterset_class = ActivityFilter
    search_fields = ["name", "description"]
    ordering_fields = ["cost", "date", "name"]
    object_permission_by_action = EDITOR_ACTIONS

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Activity.objects.none()
        visible = Trip.objects.visible_to(self.request.user)
        return Activity.objects.filter(destination__trip__in=visible).select_related(
            "destination__trip"
        )
