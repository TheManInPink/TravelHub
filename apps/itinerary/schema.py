"""Destinations, activités, météo et pays dans l'API GraphQL.

Les mutations réutilisent DestinationSerializer et ActivitySerializer. Le voyage ou la
destination parent est cherché parmi les objets visibles. S'il est inconnu, on renvoie
not_found, et s'il est visible sans droit d'écriture, permission_denied. Model.clean()
est aussi appliqué.
"""

import graphene
from django.db import transaction
from graphene_django import DjangoObjectType

from apps.core.graphql import (
    authenticated_user,
    check_object_permission,
    choices_enum,
    get_or_not_found,
    save_serializer,
    serializer_context,
    visible_trips,
)
from apps.core.permissions import IsTripEditor
from apps.integrations.schema import CountryInfo, SourceWarning, Weather
from apps.integrations.services.aggregator import get_destination_overview
from apps.integrations.services.countries import get_country
from apps.trips.schema import TripType

from .models import Activity, ActivityCategory, Destination
from .serializers import ActivitySerializer, DestinationSerializer
from .services import destination_forecast

DESTINATION_NOT_FOUND = "Destination introuvable."
ACTIVITY_NOT_FOUND = "Activité introuvable."

ActivityCategoryEnum = choices_enum(ActivityCategory, "ActivityCategory", "Catégorie d'activité.")


def visible_destinations(info):
    # select_related, car les permissions objet passent par destination.trip.
    return Destination.objects.filter(trip__in=visible_trips(info)).select_related("trip")


def visible_activities(info):
    return Activity.objects.filter(destination__trip__in=visible_trips(info)).select_related(
        "destination__trip"
    )


class ActivityType(DjangoObjectType):
    category = graphene.Field(ActivityCategoryEnum, required=True)

    class Meta:
        model = Activity
        name = "Activity"
        fields = [
            "id",
            "destination",
            "name",
            "description",
            "category",
            "date",
            "start_time",
            "cost",
            "created_at",
            "updated_at",
        ]
        convert_choices_to_enum = False


class DestinationType(DjangoObjectType):
    weather = graphene.Field(
        Weather,
        description=(
            "Météo du séjour (Open-Meteo, cache 30 min). Géocode la ville si besoin ; "
            "en cas d'échec, null et une erreur au code du service externe."
        ),
    )
    country_info = graphene.Field(
        CountryInfo, description="Pays du code pays (Countries GraphQL, cache 24 h)."
    )

    class Meta:
        model = Destination
        name = "Destination"
        fields = [
            "id",
            "trip",
            "order",
            "city",
            "country",
            "country_code",
            "arrival_date",
            "departure_date",
            "latitude",
            "longitude",
            "activities",
            "created_at",
            "updated_at",
        ]

    def resolve_weather(root, info):
        return destination_forecast(root)

    def resolve_country_info(root, info):
        return get_country(root.country_code)


class DestinationOverviewType(graphene.ObjectType):
    """Base de données, météo et pays ensemble. Les deux services sont appelés en parallèle.

    Si une source échoue, son bloc vaut null et un avertissement est ajouté. La requête
    réussit quand même (dégradation partielle).
    """

    destination = graphene.Field(DestinationType, required=True)
    trip = graphene.Field(TripType, required=True)
    activities = graphene.List(graphene.NonNull(ActivityType), required=True)
    activity_count = graphene.Int(required=True)
    total_cost = graphene.Decimal(required=True, description="Somme des coûts des activités.")
    weather = graphene.Field(Weather)
    country = graphene.Field(CountryInfo)
    warnings = graphene.List(graphene.NonNull(SourceWarning), required=True)

    class Meta:
        name = "DestinationOverview"

    def resolve_trip(root, info):
        return root.destination.trip


class Query(graphene.ObjectType):
    destination = graphene.Field(DestinationType, id=graphene.ID(required=True))
    destination_overview = graphene.Field(DestinationOverviewType, id=graphene.ID(required=True))

    def resolve_destination(root, info, id):
        return get_or_not_found(visible_destinations(info), DESTINATION_NOT_FOUND, pk=id)

    def resolve_destination_overview(root, info, id):
        destination = get_or_not_found(visible_destinations(info), DESTINATION_NOT_FOUND, pk=id)
        return get_destination_overview(destination)


class DestinationCreateInput(graphene.InputObjectType):
    trip = graphene.ID(required=True, description="Voyage dont vous êtes propriétaire ou éditeur.")
    order = graphene.Int(required=True)
    city = graphene.String(required=True)
    country = graphene.String(required=True)
    country_code = graphene.String(required=True, description="ISO 3166-1 alpha-2, ex. JP.")
    arrival_date = graphene.Date(required=True)
    departure_date = graphene.Date(required=True)
    latitude = graphene.Decimal()
    longitude = graphene.Decimal()


class DestinationUpdateInput(graphene.InputObjectType):
    """Seuls les champs fournis sont modifiés. Changer de ville efface les coordonnées."""

    order = graphene.Int()
    city = graphene.String()
    country = graphene.String()
    country_code = graphene.String()
    arrival_date = graphene.Date()
    departure_date = graphene.Date()
    latitude = graphene.Decimal()
    longitude = graphene.Decimal()


class ActivityCreateInput(graphene.InputObjectType):
    destination = graphene.ID(
        required=True, description="Destination d'un voyage dont vous êtes propriétaire ou éditeur."
    )
    name = graphene.String(required=True)
    description = graphene.String()
    category = ActivityCategoryEnum(description="OTHER par défaut.")
    date = graphene.Date(required=True)
    start_time = graphene.Time()
    cost = graphene.Decimal()


class ActivityUpdateInput(graphene.InputObjectType):
    """Seuls les champs fournis sont modifiés."""

    name = graphene.String()
    description = graphene.String()
    category = ActivityCategoryEnum()
    date = graphene.Date()
    start_time = graphene.Time()
    cost = graphene.Decimal()


class CreateDestination(graphene.Mutation):
    """Ajoute une destination à un voyage. Réservé au propriétaire et aux éditeurs."""

    class Arguments:
        input = DestinationCreateInput(required=True)

    destination = graphene.Field(DestinationType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, input):
        authenticated_user(info)
        serializer = DestinationSerializer(data=dict(input), context=serializer_context(info))
        return cls(destination=save_serializer(serializer))


class UpdateDestination(graphene.Mutation):
    """Modifie une destination. Réservé au propriétaire et aux éditeurs du voyage."""

    class Arguments:
        id = graphene.ID(required=True)
        input = DestinationUpdateInput(required=True)

    destination = graphene.Field(DestinationType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, id, input):
        destination = get_or_not_found(visible_destinations(info), DESTINATION_NOT_FOUND, pk=id)
        check_object_permission(info, IsTripEditor, destination)
        serializer = DestinationSerializer(
            destination, data=dict(input), partial=True, context=serializer_context(info)
        )
        return cls(destination=save_serializer(serializer))


class DeleteDestination(graphene.Mutation):
    """Supprime une destination et ses activités. Réservé au propriétaire et aux éditeurs."""

    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean(required=True)
    id = graphene.ID(required=True, description="Identifiant de la destination supprimée.")

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, id):
        destination = get_or_not_found(visible_destinations(info), DESTINATION_NOT_FOUND, pk=id)
        check_object_permission(info, IsTripEditor, destination)
        pk = destination.pk
        destination.delete()
        return cls(ok=True, id=pk)


class CreateActivity(graphene.Mutation):
    """Ajoute une activité à une destination. Réservé au propriétaire et aux éditeurs."""

    class Arguments:
        input = ActivityCreateInput(required=True)

    activity = graphene.Field(ActivityType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, input):
        authenticated_user(info)
        serializer = ActivitySerializer(data=dict(input), context=serializer_context(info))
        return cls(activity=save_serializer(serializer))


class UpdateActivity(graphene.Mutation):
    """Modifie une activité. Réservé au propriétaire et aux éditeurs du voyage."""

    class Arguments:
        id = graphene.ID(required=True)
        input = ActivityUpdateInput(required=True)

    activity = graphene.Field(ActivityType)

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, id, input):
        activity = get_or_not_found(visible_activities(info), ACTIVITY_NOT_FOUND, pk=id)
        check_object_permission(info, IsTripEditor, activity)
        serializer = ActivitySerializer(
            activity, data=dict(input), partial=True, context=serializer_context(info)
        )
        return cls(activity=save_serializer(serializer))


class DeleteActivity(graphene.Mutation):
    """Supprime une activité. Réservé au propriétaire et aux éditeurs du voyage."""

    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean(required=True)
    id = graphene.ID(required=True, description="Identifiant de l'activité supprimée.")

    @classmethod
    @transaction.atomic
    def mutate(cls, root, info, id):
        activity = get_or_not_found(visible_activities(info), ACTIVITY_NOT_FOUND, pk=id)
        check_object_permission(info, IsTripEditor, activity)
        pk = activity.pk
        activity.delete()
        return cls(ok=True, id=pk)


class Mutation(graphene.ObjectType):
    create_destination = CreateDestination.Field()
    update_destination = UpdateDestination.Field()
    delete_destination = DeleteDestination.Field()
    create_activity = CreateActivity.Field()
    update_activity = UpdateActivity.Field()
    delete_activity = DeleteActivity.Field()
