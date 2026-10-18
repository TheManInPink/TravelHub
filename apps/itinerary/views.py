from drf_spectacular.utils import OpenApiExample, extend_schema, extend_schema_view
from rest_framework import viewsets

from apps.core.openapi import (
    FORBIDDEN,
    NOT_FOUND,
    THROTTLED,
    UNAUTHORIZED,
    VALIDATION_ERROR,
    error_body,
)
from apps.core.permissions import IsTripEditor, TripRolePermissionMixin
from apps.trips.models import Trip

from .filters import ActivityFilter, DestinationFilter
from .models import Activity, Destination
from .serializers import ActivitySerializer, DestinationSerializer

COMMON_ERRORS = {401: UNAUTHORIZED, 429: THROTTLED}
OBJECT_ERRORS = {**COMMON_ERRORS, 404: NOT_FOUND}
WRITE_ERRORS = {400: VALIDATION_ERROR, 403: FORBIDDEN, **OBJECT_ERRORS}

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
