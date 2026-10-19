from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.core.permissions import IsTripEditor
from apps.core.serializers import ModelCleanMixin
from apps.integrations.serializers import (
    CountrySerializer,
    CurrentWeatherSerializer,
    DailyForecastSerializer,
    ForecastSerializer,
    UnitsSerializer,
)
from apps.integrations.services.aggregator import SOURCES
from apps.trips.models import Trip

from .models import Activity, Destination


class NestedActivitySerializer(serializers.ModelSerializer):
    """Activité affichée en lecture seule dans le détail d'un voyage."""

    class Meta:
        model = Activity
        fields = ["id", "name", "description", "category", "date", "start_time", "cost"]
        read_only_fields = fields


class DestinationSummarySerializer(serializers.ModelSerializer):
    """Destination en lecture seule, sans ses activités."""

    class Meta:
        model = Destination
        fields = [
            "id",
            "order",
            "city",
            "country",
            "country_code",
            "arrival_date",
            "departure_date",
            "latitude",
            "longitude",
        ]
        read_only_fields = fields


class NestedDestinationSerializer(DestinationSummarySerializer):
    """Destination et ses activités, affichées en lecture seule dans le détail d'un voyage."""

    activities = NestedActivitySerializer(many=True, read_only=True)

    class Meta(DestinationSummarySerializer.Meta):
        fields = [*DestinationSummarySerializer.Meta.fields, "activities"]
        read_only_fields = fields


class EditableParentField(serializers.PrimaryKeyRelatedField):
    """Voyage ou destination auquel rattacher l'objet créé ou modifié.

    Le parent est cherché parmi les objets visibles par l'utilisateur : inconnu ou
    invisible, il donne 404 comme un GET ; visible sans droit d'écriture, 403.
    NotFound et PermissionDenied ne sont pas des ValidationError : elles interrompent
    la validation et l'emportent sur les erreurs des autres champs.
    """

    def __init__(self, *, trip_lookup, **kwargs):
        # Chemin du parent vers son voyage : "pk" pour un Trip, "trip" pour une Destination.
        self.trip_lookup = trip_lookup
        super().__init__(**kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        request = self.context.get("request")
        if request is None:  # génération du schéma OpenAPI
            return queryset
        visible = Trip.objects.visible_to(request.user)
        return queryset.filter(**{f"{self.trip_lookup}__in": visible})

    def to_internal_value(self, data):
        try:
            parent = super().to_internal_value(data)
        except serializers.ValidationError as exc:
            if exc.get_codes() == ["does_not_exist"]:
                name = self.queryset.model._meta.verbose_name
                raise NotFound(f"{name.capitalize()} introuvable.") from exc
            raise
        if not IsTripEditor().has_object_permission(self.context["request"], None, parent):
            raise PermissionDenied(IsTripEditor.message)
        return parent


class UpperCaseCharField(serializers.CharField):
    """Met la valeur en majuscules avant les validateurs : « jp » devient « JP »."""

    def to_internal_value(self, data):
        return super().to_internal_value(data).upper()


class DestinationSerializer(ModelCleanMixin, serializers.ModelSerializer):
    trip = EditableParentField(
        queryset=Trip.objects.all(),
        trip_lookup="pk",
        help_text="Voyage dont vous êtes propriétaire ou éditeur.",
    )
    country_code = UpperCaseCharField(
        max_length=2,
        validators=Destination._meta.get_field("country_code").validators,
        help_text="Code ISO 3166-1 alpha-2, par exemple JP.",
    )

    class Meta:
        model = Destination
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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate(self, attrs):
        # Les coordonnées (souvent mémorisées par le géocodage) ne valent plus pour une
        # autre ville : sans nouvelles coordonnées fournies, elles sont effacées.
        if self.instance is not None and not {"latitude", "longitude"} & attrs.keys():
            if any(
                field in attrs and attrs[field] != getattr(self.instance, field)
                for field in ("city", "country_code")
            ):
                attrs["latitude"] = attrs["longitude"] = None
        return super().validate(attrs)


class DestinationWeatherSerializer(serializers.Serializer):
    """Météo d'une destination : {"destination": …, "forecast": Forecast d'Open-Meteo}."""

    destination = serializers.IntegerField(source="destination.pk")
    city = serializers.CharField(source="destination.city")
    country_code = serializers.CharField(source="destination.country_code")
    latitude = serializers.DecimalField(
        source="destination.latitude", max_digits=9, decimal_places=6
    )
    longitude = serializers.DecimalField(
        source="destination.longitude", max_digits=9, decimal_places=6
    )
    timezone = serializers.CharField(
        source="forecast.timezone", help_text="Fuseau de la destination, ex. Asia/Tokyo."
    )
    units = UnitsSerializer(source="forecast.units")
    current = CurrentWeatherSerializer(source="forecast.current")
    daily = DailyForecastSerializer(
        source="forecast.daily",
        many=True,
        help_text="Jours du séjour compris dans les 16 jours de prévision.",
    )


class TripSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = ["id", "title", "status", "start_date", "end_date", "budget"]
        read_only_fields = fields


class SourceWarningSerializer(serializers.Serializer):
    source = serializers.ChoiceField(
        choices=SOURCES, help_text="Bloc de la réponse resté vide (null)."
    )
    code = serializers.CharField(
        help_text="Code d'erreur du service externe, ex. external_service_unavailable."
    )
    message = serializers.CharField()


class DestinationOverviewSerializer(serializers.Serializer):
    """Vue d'ensemble produite par apps.integrations.services.aggregator."""

    destination = DestinationSummarySerializer()
    trip = TripSummarySerializer(source="destination.trip")
    activities = NestedActivitySerializer(many=True)
    activity_count = serializers.IntegerField()
    total_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, help_text="Somme des coûts des activités."
    )
    weather = ForecastSerializer(
        allow_null=True, help_text="Open-Meteo ; null si indisponible (voir warnings)."
    )
    country = CountrySerializer(
        allow_null=True, help_text="Countries GraphQL ; null si indisponible (voir warnings)."
    )
    warnings = SourceWarningSerializer(
        many=True, help_text="Une entrée par source en échec ; vide si tout a répondu."
    )


class ActivitySerializer(ModelCleanMixin, serializers.ModelSerializer):
    destination = EditableParentField(
        queryset=Destination.objects.select_related("trip"),
        trip_lookup="trip",
        help_text="Destination d'un voyage dont vous êtes propriétaire ou éditeur.",
    )
    trip = serializers.IntegerField(source="destination.trip_id", read_only=True)

    class Meta:
        model = Activity
        fields = [
            "id",
            "destination",
            "trip",
            "name",
            "description",
            "category",
            "date",
            "start_time",
            "cost",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
