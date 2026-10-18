import copy

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.serializers import UserSummarySerializer
from apps.itinerary.serializers import NestedDestinationSerializer

from .models import Trip
from .services import create_trip


class TripSerializer(serializers.ModelSerializer):
    """Voyage en liste, création et modification.

    destination_count, activity_count et total_cost proviennent de
    Trip.objects.with_totals() : le queryset de la vue doit être annoté.
    """

    owner = UserSummarySerializer(read_only=True)
    destination_count = serializers.IntegerField(read_only=True)
    activity_count = serializers.IntegerField(read_only=True)
    total_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
        help_text="Somme des coûts de toutes les activités du voyage.",
    )

    class Meta:
        model = Trip
        fields = [
            "id",
            "title",
            "description",
            "start_date",
            "end_date",
            "status",
            "budget",
            "owner",
            "destination_count",
            "activity_count",
            "total_cost",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate(self, attrs):
        # En PATCH, une seule des deux dates peut être fournie : on complète avec l'existant.
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "La date de fin doit être postérieure ou égale à la date de début."}
            )
        if self.instance is not None:
            # Trip.clean() refuse de raccourcir un voyage en laissant des destinations
            # hors de ses dates ; on l'applique à une copie pour ne pas modifier l'instance.
            candidate = copy.copy(self.instance)
            for field, value in attrs.items():
                setattr(candidate, field, value)
            try:
                candidate.clean()
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"non_field_errors": list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data):
        return create_trip(owner=self.context["request"].user, **validated_data)


class TripDetailSerializer(TripSerializer):
    """Voyage avec ses destinations et leurs activités (lecture seule)."""

    destinations = NestedDestinationSerializer(many=True, read_only=True)

    class Meta(TripSerializer.Meta):
        fields = [*TripSerializer.Meta.fields, "destinations"]
