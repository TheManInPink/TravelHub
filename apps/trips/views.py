from django.db.models import Prefetch
from drf_spectacular.utils import OpenApiExample, extend_schema, extend_schema_view
from rest_framework import viewsets

from apps.core.openapi import FORBIDDEN, NOT_FOUND, THROTTLED, UNAUTHORIZED, VALIDATION_ERROR
from apps.core.permissions import IsTripEditor, IsTripMember, IsTripOwner
from apps.itinerary.models import Destination

from .filters import TripFilter
from .models import Trip
from .serializers import TripDetailSerializer, TripSerializer

TAG = "Voyages"

TRIP_REQUEST_EXAMPLE = OpenApiExample(
    "Voyage au Japon",
    value={
        "title": "Voyage au Japon",
        "description": "Tokyo, Kyoto et Osaka au printemps.",
        "start_date": "2027-04-01",
        "end_date": "2027-04-15",
        "status": "planned",
        "budget": "4500.00",
    },
    request_only=True,
)
TRIP_RESPONSE_EXAMPLE = OpenApiExample(
    "Voyage",
    value={
        "id": 12,
        "title": "Voyage au Japon",
        "description": "Tokyo, Kyoto et Osaka au printemps.",
        "start_date": "2027-04-01",
        "end_date": "2027-04-15",
        "status": "planned",
        "budget": "4500.00",
        "owner": {"id": 1, "username": "alice", "first_name": "Alice", "last_name": "Tremblay"},
        "destination_count": 3,
        "activity_count": 8,
        "total_cost": "612.50",
        "created_at": "2026-10-18T14:00:00-04:00",
        "updated_at": "2026-10-18T14:00:00-04:00",
    },
    response_only=True,
)
INVALID_DATES_EXAMPLE = OpenApiExample(
    "Dates incohérentes",
    value={"end_date": ["La date de fin doit être postérieure ou égale à la date de début."]},
    response_only=True,
    status_codes=["400"],
)

COMMON_ERRORS = {401: UNAUTHORIZED, 429: THROTTLED}
OBJECT_ERRORS = {**COMMON_ERRORS, 404: NOT_FOUND}


@extend_schema_view(
    list=extend_schema(
        summary="Lister mes voyages",
        description=(
            "Voyages dont vous êtes propriétaire ou participant, paginés par 20. "
            "Recherche plein texte (`search`) sur le titre et la description ; "
            "tri (`ordering`) sur `start_date`, `title` ou `created_at`, préfixé de `-` "
            "pour l'ordre décroissant."
        ),
        responses={200: TripSerializer(many=True), **COMMON_ERRORS},
    ),
    create=extend_schema(
        summary="Créer un voyage",
        description="Vous devenez propriétaire du voyage et son premier participant.",
        responses={201: TripSerializer, 400: VALIDATION_ERROR, **COMMON_ERRORS},
        examples=[TRIP_REQUEST_EXAMPLE, TRIP_RESPONSE_EXAMPLE, INVALID_DATES_EXAMPLE],
    ),
    retrieve=extend_schema(
        summary="Détail d'un voyage",
        description="Inclut les destinations et leurs activités. Réservé aux participants.",
        responses={200: TripDetailSerializer, **OBJECT_ERRORS},
    ),
    update=extend_schema(
        summary="Remplacer un voyage",
        description="Réservé au propriétaire et aux éditeurs (403 pour un lecteur).",
        responses={
            200: TripSerializer,
            400: VALIDATION_ERROR,
            403: FORBIDDEN,
            **OBJECT_ERRORS,
        },
        examples=[TRIP_REQUEST_EXAMPLE, TRIP_RESPONSE_EXAMPLE, INVALID_DATES_EXAMPLE],
    ),
    partial_update=extend_schema(
        summary="Modifier un voyage",
        description="Réservé au propriétaire et aux éditeurs (403 pour un lecteur).",
        responses={
            200: TripSerializer,
            400: VALIDATION_ERROR,
            403: FORBIDDEN,
            **OBJECT_ERRORS,
        },
        examples=[
            OpenApiExample("Changer le statut", value={"status": "ongoing"}, request_only=True),
            TRIP_RESPONSE_EXAMPLE,
        ],
    ),
    destroy=extend_schema(
        summary="Supprimer un voyage",
        description="Réservé au propriétaire. Supprime aussi destinations et activités.",
        responses={204: None, 403: FORBIDDEN, **OBJECT_ERRORS},
    ),
)
@extend_schema(tags=[TAG])
class TripViewSet(viewsets.ModelViewSet):
    """CRUD des voyages visibles par l'utilisateur connecté.

    Le queryset ne contient que les voyages de l'utilisateur : un voyage d'autrui
    donne 404 avant même la vérification des permissions objet.
    """

    filterset_class = TripFilter
    search_fields = ["title", "description"]
    # Pas de champ de relation ici : une jointure fausserait les Sum/Count de with_totals().
    ordering_fields = ["start_date", "title", "created_at"]
    ordering = ["start_date"]

    permission_by_action = {
        "update": IsTripEditor,
        "partial_update": IsTripEditor,
        "destroy": IsTripOwner,
    }

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Trip.objects.none()
        queryset = Trip.objects.visible_to(self.request.user).with_totals().select_related("owner")
        if self.action == "retrieve":
            queryset = queryset.prefetch_related(
                Prefetch(
                    "destinations",
                    queryset=Destination.objects.order_by("order").prefetch_related("activities"),
                )
            )
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TripDetailSerializer
        return TripSerializer

    def get_permissions(self):
        object_permission = self.permission_by_action.get(self.action, IsTripMember)
        return [*super().get_permissions(), object_permission()]

    def perform_create(self, serializer):
        self._save_and_reload(serializer)

    def perform_update(self, serializer):
        self._save_and_reload(serializer)

    def _save_and_reload(self, serializer):
        # L'instance sauvegardée n'a pas les annotations de with_totals() : on la relit
        # depuis le queryset de la vue pour que la réponse contienne les totaux.
        trip = serializer.save()
        serializer.instance = self.get_queryset().get(pk=trip.pk)
