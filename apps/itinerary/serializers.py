from rest_framework import serializers

from .models import Activity, Destination


class NestedActivitySerializer(serializers.ModelSerializer):
    """Activité affichée en lecture seule dans le détail d'un voyage."""

    class Meta:
        model = Activity
        fields = ["id", "name", "description", "category", "date", "start_time", "cost"]
        read_only_fields = fields


class NestedDestinationSerializer(serializers.ModelSerializer):
    """Destination et ses activités, affichées en lecture seule dans le détail d'un voyage."""

    activities = NestedActivitySerializer(many=True, read_only=True)

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
            "activities",
        ]
        read_only_fields = fields
