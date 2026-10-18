from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

from apps.core.openapi import (
    FORBIDDEN,
    NOT_FOUND,
    THROTTLED,
    UNAUTHORIZED,
    VALIDATION_ERROR,
    error_body,
)
from apps.core.permissions import IsTripEditor, IsTripOwner, TripRolePermissionMixin
from apps.itinerary.models import Destination

from .filters import TripFilter
from .models import Trip
from .serializers import (
    ParticipantCreateSerializer,
    ParticipantRoleSerializer,
    ParticipantSerializer,
    TripCloneSerializer,
    TripDetailSerializer,
    TripSerializer,
    TripStatsSerializer,
)
from .services import (
    LAST_OWNER_MESSAGE,
    add_participant,
    change_participant_role,
    clone_trip,
    compute_trip_stats,
    remove_participant,
)

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
    value=error_body(
        "validation_error",
        "Les données envoyées sont invalides.",
        {"end_date": ["La date de fin doit être postérieure ou égale à la date de début."]},
    ),
    response_only=True,
    status_codes=["400"],
)
LAST_OWNER_EXAMPLE = OpenApiExample(
    "Dernier propriétaire",
    value=error_body("validation_error", LAST_OWNER_MESSAGE, {"role": [LAST_OWNER_MESSAGE]}),
    response_only=True,
    status_codes=["400"],
)
PARTICIPANT_RESPONSE_EXAMPLE = OpenApiExample(
    "Participant",
    value={
        "user": {"id": 2, "username": "mamadou", "first_name": "Mamadou", "last_name": "Diallo"},
        "role": "editor",
        "joined_at": "2026-10-18T14:00:00-04:00",
        "invited_by": {
            "id": 1,
            "username": "alice",
            "first_name": "Alice",
            "last_name": "Tremblay",
        },
    },
    response_only=True,
)
USER_ID_PARAMETER = OpenApiParameter(
    "user_id", OpenApiTypes.INT, OpenApiParameter.PATH, description="Identifiant de l'utilisateur."
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
class TripViewSet(TripRolePermissionMixin, viewsets.ModelViewSet):
    """CRUD des voyages visibles par l'utilisateur connecté.

    Le queryset ne contient que les voyages de l'utilisateur : un voyage d'autrui
    donne 404 avant même la vérification des permissions objet.
    """

    filterset_class = TripFilter
    search_fields = ["title", "description"]
    # Pas de champ de relation ici : une jointure fausserait les Sum/Count de with_totals().
    ordering_fields = ["start_date", "title", "created_at"]
    ordering = ["start_date"]

    object_permission_by_action = {
        "update": IsTripEditor,
        "partial_update": IsTripEditor,
        "destroy": IsTripOwner,
        "participant_detail": IsTripOwner,
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

    def get_object_permission_class(self):
        # participants : lecture par tout participant, ajout par le propriétaire seulement.
        if self.action == "participants" and self.request.method not in SAFE_METHODS:
            return IsTripOwner
        return super().get_object_permission_class()

    def perform_create(self, serializer):
        self._save_and_reload(serializer)

    def perform_update(self, serializer):
        self._save_and_reload(serializer)

    def _save_and_reload(self, serializer):
        # L'instance sauvegardée n'a pas les annotations de with_totals() : on la relit
        # depuis le queryset de la vue pour que la réponse contienne les totaux.
        trip = serializer.save()
        serializer.instance = self.get_queryset().get(pk=trip.pk)

    @extend_schema(
        summary="Statistiques d'un voyage",
        description=(
            "Coût total, budget restant, coût moyen et, par catégorie d'activité, nombre, "
            "somme et moyenne des coûts (agrégations calculées par PostgreSQL)."
        ),
        responses={200: TripStatsSerializer, **OBJECT_ERRORS},
        examples=[
            OpenApiExample(
                "Statistiques",
                value={
                    "trip": 12,
                    "budget": "4500.00",
                    "total_cost": "612.50",
                    "remaining_budget": "3887.50",
                    "destination_count": 3,
                    "activity_count": 8,
                    "average_cost": "76.56",
                    "by_category": [
                        {
                            "category": "accommodation",
                            "label": "Hébergement",
                            "count": 2,
                            "total_cost": "420.00",
                            "average_cost": "210.00",
                        },
                        {
                            "category": "food",
                            "label": "Restauration",
                            "count": 6,
                            "total_cost": "192.50",
                            "average_cost": "32.08",
                        },
                    ],
                },
                response_only=True,
            )
        ],
    )
    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        trip = self.get_object()
        return Response(TripStatsSerializer(compute_trip_stats(trip)).data)

    @extend_schema(
        summary="Dupliquer un voyage",
        description=(
            "Copie le voyage, ses destinations et leurs activités dans un nouveau brouillon "
            "dont vous êtes le propriétaire et le seul participant. Ouvert à tout participant. "
            "La copie se fait dans une transaction : en cas d'erreur, rien n'est créé."
        ),
        request=TripCloneSerializer,
        responses={201: TripSerializer, 400: VALIDATION_ERROR, **OBJECT_ERRORS},
        examples=[
            OpenApiExample("Titre de la copie", value={"title": "Japon 2028"}, request_only=True),
            TRIP_RESPONSE_EXAMPLE,
        ],
    )
    @action(detail=True, methods=["post"])
    def clone(self, request, pk=None):
        source = self.get_object()
        serializer = TripCloneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        copy = clone_trip(source, owner=request.user, **serializer.validated_data)
        copy = self.get_queryset().get(pk=copy.pk)  # avec les totaux de with_totals()
        data = TripSerializer(copy, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)

    @extend_schema(
        methods=["GET"],
        summary="Lister les participants",
        description="Ouvert à tout participant du voyage.",
        responses={200: ParticipantSerializer(many=True), **OBJECT_ERRORS},
        examples=[PARTICIPANT_RESPONSE_EXAMPLE],
    )
    @extend_schema(
        methods=["POST"],
        summary="Ajouter un participant",
        description=(
            "Ajoute l'utilisateur inscrit sous ce courriel, comme éditeur ou lecteur. "
            "Réservé au propriétaire."
        ),
        request=ParticipantCreateSerializer,
        responses={
            201: ParticipantSerializer,
            400: VALIDATION_ERROR,
            403: FORBIDDEN,
            **OBJECT_ERRORS,
        },
        examples=[
            OpenApiExample(
                "Ajout d'un éditeur",
                value={"email": "mamadou@example.com", "role": "editor"},
                request_only=True,
            ),
            PARTICIPANT_RESPONSE_EXAMPLE,
        ],
    )
    @action(detail=True, methods=["get", "post"])
    def participants(self, request, pk=None):
        trip = self.get_object()
        if request.method == "GET":
            memberships = trip.memberships.select_related("user", "invited_by")
            return Response(ParticipantSerializer(memberships, many=True).data)
        serializer = ParticipantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = add_participant(trip, invited_by=request.user, **serializer.validated_data)
        return Response(ParticipantSerializer(membership).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        methods=["PATCH"],
        summary="Changer le rôle d'un participant",
        description=(
            "Réservé au propriétaire. Le rôle owner transfère la propriété : l'ancien "
            "propriétaire devient éditeur. Le propriétaire ne peut pas être rétrogradé."
        ),
        parameters=[USER_ID_PARAMETER],
        request=ParticipantRoleSerializer,
        responses={
            200: ParticipantSerializer,
            400: VALIDATION_ERROR,
            403: FORBIDDEN,
            **OBJECT_ERRORS,
        },
        examples=[
            OpenApiExample("Passer lecteur", value={"role": "viewer"}, request_only=True),
            PARTICIPANT_RESPONSE_EXAMPLE,
            LAST_OWNER_EXAMPLE,
        ],
    )
    @extend_schema(
        methods=["DELETE"],
        summary="Retirer un participant",
        description="Réservé au propriétaire, qui ne peut pas se retirer lui-même.",
        parameters=[USER_ID_PARAMETER],
        responses={204: None, 400: VALIDATION_ERROR, 403: FORBIDDEN, **OBJECT_ERRORS},
    )
    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"participants/(?P<user_id>[0-9]+)",
        url_name="participant-detail",
    )
    def participant_detail(self, request, pk=None, user_id=None):
        trip = self.get_object()
        membership = get_object_or_404(
            trip.memberships.select_related("trip", "user", "invited_by"), user_id=user_id
        )
        if request.method == "DELETE":
            remove_participant(membership)
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = ParticipantRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = change_participant_role(membership, serializer.validated_data["role"])
        return Response(ParticipantSerializer(membership).data)
