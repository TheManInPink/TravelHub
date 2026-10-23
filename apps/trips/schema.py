"""Voyages et participants dans l'API GraphQL.

Les mutations réutilisent les serializers et les services de l'API REST : mêmes
validations, mêmes messages, mêmes règles de propriété.
"""

import graphene
from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from graphene_django import DjangoObjectType
from rest_framework.exceptions import ValidationError

from apps.core.graphql import (
    authenticated_user,
    check_object_permission,
    choices_enum,
    get_or_not_found,
    save_serializer,
    selected_fields,
    serializer_context,
    visible_trips,
)
from apps.core.permissions import IsTripEditor, IsTripOwner
from apps.itinerary.models import Activity

from .models import ParticipantRole, Trip, TripParticipant, TripStatus
from .serializers import ParticipantCreateSerializer, TripCloneSerializer, TripSerializer
from .services import add_participant, clone_trip, remove_participant

TRIP_NOT_FOUND = "Voyage introuvable."
PAGE_SIZE = 20  # comme la pagination de l'API REST
MAX_PAGE_SIZE = 100
PARTICIPANT_NOT_FOUND = "Ce voyage n'a pas de participant avec cet identifiant."

TripStatusEnum = choices_enum(TripStatus, "TripStatus", "Statut d'un voyage.")
ParticipantRoleEnum = choices_enum(ParticipantRole, "ParticipantRole", "Rôle dans un voyage.")


class InvitableRole(graphene.Enum):
    """Rôles attribuables à l'ajout d'un participant (la propriété ne se donne pas ainsi)."""

    EDITOR = ParticipantRole.EDITOR.value
    VIEWER = ParticipantRole.VIEWER.value


class TripOrderBy(graphene.Enum):
    """Tri de myTrips ; START_DATE par défaut. Départage par identifiant."""

    START_DATE = "start_date"
    START_DATE_DESC = "-start_date"
    TITLE = "title"
    TITLE_DESC = "-title"
    CREATED_AT = "created_at"
    CREATED_AT_DESC = "-created_at"


class TripParticipantType(DjangoObjectType):
    role = graphene.Field(ParticipantRoleEnum, required=True)

    class Meta:
        model = TripParticipant
        name = "TripParticipant"
        fields = ["user", "role", "joined_at", "invited_by"]
        convert_choices_to_enum = False


class TripType(DjangoObjectType):
    """Voyage visible par l'utilisateur : il en est propriétaire ou participant."""

    status = graphene.Field(TripStatusEnum, required=True)
    participants = graphene.List(
        graphene.NonNull(TripParticipantType),
        required=True,
        description="Participants et leur rôle, propriétaire compris.",
    )
    destination_count = graphene.Int(required=True)
    activity_count = graphene.Int(required=True)
    total_cost = graphene.Decimal(
        required=True, description="Somme des coûts de toutes les activités du voyage."
    )

    class Meta:
        model = Trip
        name = "Trip"
        fields = [
            "id",
            "title",
            "description",
            "start_date",
            "end_date",
            "status",
            "budget",
            "owner",
            "destinations",
            "created_at",
            "updated_at",
        ]
        convert_choices_to_enum = False

    def resolve_participants(root, info):
        # select_related() créerait un nouveau queryset : on garde le préchargement
        # de with_relations() quand il existe.
        if "memberships" in getattr(root, "_prefetched_objects_cache", {}):
            return root.memberships.all()
        return root.memberships.select_related("user", "invited_by")

    # Les totaux viennent de Trip.objects.with_totals() ; un voyage atteint par une
    # relation (destination.trip) n'est pas annoté : ils sont alors calculés.
    def resolve_destination_count(root, info):
        if hasattr(root, "destination_count"):
            return root.destination_count
        return root.destinations.count()

    def resolve_activity_count(root, info):
        if hasattr(root, "activity_count"):
            return root.activity_count
        return Activity.objects.filter(destination__trip=root).count()

    def resolve_total_cost(root, info):
        if hasattr(root, "total_cost"):
            return root.total_cost
        total = Activity.objects.filter(destination__trip=root).aggregate(total=Sum("cost"))
        return total["total"] or 0


def with_relations(trips, info):
    """Totaux et propriétaire, plus les relations demandées : pas de requête par voyage."""
    fields = selected_fields(info)
    trips = trips.with_totals().select_related("owner")
    if "destinations" in fields:
        trips = trips.prefetch_related("destinations__activities")
    if "participants" in fields:
        memberships = TripParticipant.objects.select_related("user", "invited_by")
        trips = trips.prefetch_related(Prefetch("memberships", queryset=memberships))
    return trips


def reload_trip(info, trip):
    """Voyage relu avec ses totaux, après une création ou une modification."""
    return visible_trips(info).with_totals().select_related("owner").get(pk=trip.pk)


def filtered_trips(info, status=None, start_after=None, search=None):
    """Voyages visibles filtrés par les arguments communs à myTrips et myTripsCount."""
    trips = visible_trips(info)
    if status:
        trips = trips.filter(status=status)
    if start_after:
        trips = trips.filter(start_date__gte=start_after)
    # Comme le SearchFilter de l'API REST : chaque mot doit figurer quelque part.
    for term in (search or "").split():
        trips = trips.filter(Q(title__icontains=term) | Q(description__icontains=term))
    return trips


def check_page(limit, offset):
    errors = {}
    if not 1 <= limit <= MAX_PAGE_SIZE:
        errors["limit"] = [f"La taille de page doit être comprise entre 1 et {MAX_PAGE_SIZE}."]
    if offset < 0:
        errors["offset"] = ["Le décalage ne peut pas être négatif."]
    if errors:
        raise ValidationError(errors)


def filter_arguments():
    return {
        "status": TripStatusEnum(),
        "start_after": graphene.Date(description="Voyages commençant à cette date ou après."),
        "search": graphene.String(description="Mots cherchés dans le titre ou la description."),
    }


class Query(graphene.ObjectType):
    my_trips = graphene.List(
        graphene.NonNull(TripType),
        required=True,
        **filter_arguments(),
        order_by=TripOrderBy(),
        limit=graphene.Int(
            default_value=PAGE_SIZE,
            description=f"Nombre de voyages, au plus {MAX_PAGE_SIZE}.",
        ),
        offset=graphene.Int(default_value=0, description="Nombre de voyages à sauter."),
        description=(
            "Voyages dont vous êtes propriétaire ou participant, par pages de limit "
            "voyages ; myTripsCount donne le total."
        ),
    )
    my_trips_count = graphene.Int(
        required=True,
        **filter_arguments(),
        description="Nombre de voyages de myTrips avec les mêmes filtres, toutes pages confondues.",
    )
    trip = graphene.Field(TripType, id=graphene.ID(required=True))

    def resolve_my_trips(
        root, info, order_by=TripOrderBy.START_DATE, limit=PAGE_SIZE, offset=0, **filters
    ):
        check_page(limit, offset)
        trips = with_relations(filtered_trips(info, **filters), info)
        return trips.order_by(order_by.value, "pk")[offset : offset + limit]

    def resolve_my_trips_count(root, info, **filters):
        return filtered_trips(info, **filters).count()

    def resolve_trip(root, info, id):
        return get_or_not_found(with_relations(visible_trips(info), info), TRIP_NOT_FOUND, pk=id)


class TripCreateInput(graphene.InputObjectType):
    title = graphene.String(required=True)
    description = graphene.String()
    start_date = graphene.Date(required=True)
    end_date = graphene.Date(required=True)
    status = TripStatusEnum(description="DRAFT par défaut.")
    budget = graphene.Decimal()


class TripUpdateInput(graphene.InputObjectType):
    """Seuls les champs fournis sont modifiés."""

    title = graphene.String()
    description = graphene.String()
    start_date = graphene.Date()
    end_date = graphene.Date()
    status = TripStatusEnum()
    budget = graphene.Decimal()


class CreateTrip(graphene.Mutation):
    """Crée un voyage : vous en devenez propriétaire et premier participant."""

    class Arguments:
        input = TripCreateInput(required=True)

    trip = graphene.Field(TripType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, input):
        authenticated_user(info)
        serializer = TripSerializer(data=dict(input), context=serializer_context(info))
        return cls(trip=reload_trip(info, save_serializer(serializer)))


class UpdateTrip(graphene.Mutation):
    """Modifie un voyage. Réservé au propriétaire et aux éditeurs."""

    class Arguments:
        id = graphene.ID(required=True)
        input = TripUpdateInput(required=True)

    trip = graphene.Field(TripType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, id, input):
        trip = get_or_not_found(visible_trips(info), TRIP_NOT_FOUND, pk=id)
        check_object_permission(info, IsTripEditor, trip)
        serializer = TripSerializer(
            trip, data=dict(input), partial=True, context=serializer_context(info)
        )
        return cls(trip=reload_trip(info, save_serializer(serializer)))


class DeleteTrip(graphene.Mutation):
    """Supprime un voyage, ses destinations et ses activités. Réservé au propriétaire."""

    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean(required=True)
    id = graphene.ID(required=True, description="Identifiant du voyage supprimé.")

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, id):
        trip = get_or_not_found(visible_trips(info), TRIP_NOT_FOUND, pk=id)
        check_object_permission(info, IsTripOwner, trip)
        pk = trip.pk
        trip.delete()
        return cls(ok=True, id=pk)


class CloneTrip(graphene.Mutation):
    """Copie un voyage, ses destinations et ses activités dans un brouillon à vous.

    Ouvert à tout participant ; tout est copié dans une transaction.
    """

    class Arguments:
        id = graphene.ID(required=True)
        title = graphene.String(description="« Copie de <titre> » par défaut.")

    trip = graphene.Field(TripType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, id, title=None):
        source = get_or_not_found(visible_trips(info), TRIP_NOT_FOUND, pk=id)
        serializer = TripCloneSerializer(data={} if title is None else {"title": title})
        serializer.is_valid(raise_exception=True)
        copy = clone_trip(source, owner=info.context.user, **serializer.validated_data)
        return cls(trip=reload_trip(info, copy))


class AddParticipant(graphene.Mutation):
    """Ajoute au voyage l'utilisateur inscrit sous ce courriel. Réservé au propriétaire."""

    class Arguments:
        trip_id = graphene.ID(required=True)
        email = graphene.String(required=True)
        role = InvitableRole(description="VIEWER par défaut.")

    participant = graphene.Field(TripParticipantType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, trip_id, email, role=None):
        trip = get_or_not_found(visible_trips(info), TRIP_NOT_FOUND, pk=trip_id)
        check_object_permission(info, IsTripOwner, trip)
        data = {"email": email} if role is None else {"email": email, "role": role.value}
        serializer = ParticipantCreateSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        participant = add_participant(
            trip, invited_by=info.context.user, **serializer.validated_data
        )
        return cls(participant=participant)


class RemoveParticipant(graphene.Mutation):
    """Retire un participant. Réservé au propriétaire, qui ne peut pas se retirer."""

    class Arguments:
        trip_id = graphene.ID(required=True)
        user_id = graphene.ID(required=True)

    ok = graphene.Boolean(required=True)
    trip = graphene.Field(TripType, description="Le voyage, sans le participant retiré.")

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, trip_id, user_id):
        trip = get_or_not_found(visible_trips(info), TRIP_NOT_FOUND, pk=trip_id)
        check_object_permission(info, IsTripOwner, trip)
        membership = get_or_not_found(
            trip.memberships.select_related("trip"), PARTICIPANT_NOT_FOUND, user_id=user_id
        )
        remove_participant(membership)
        return cls(ok=True, trip=reload_trip(info, trip))


class Mutation(graphene.ObjectType):
    create_trip = CreateTrip.Field()
    update_trip = UpdateTrip.Field()
    delete_trip = DeleteTrip.Field()
    clone_trip = CloneTrip.Field()
    add_participant = AddParticipant.Field()
    remove_participant = RemoveParticipant.Field()
