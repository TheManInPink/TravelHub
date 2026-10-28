from rest_framework import serializers

from apps.accounts.serializers import UserSummarySerializer
from apps.core.serializers import ModelCleanMixin
from apps.itinerary.models import Activity
from apps.itinerary.serializers import NestedDestinationSerializer

from .models import Trip, TripParticipant
from .services import create_trip


class TripSerializer(ModelCleanMixin, serializers.ModelSerializer):
    """Voyage en liste, en création et en modification.

    destination_count, activity_count et total_cost viennent de Trip.objects.with_totals().
    Le queryset de la vue doit donc être annoté.
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
        # En PATCH, on peut n'envoyer qu'une des deux dates. On complète avec la valeur actuelle.
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "La date de fin doit être postérieure ou égale à la date de début."}
            )
        # Ensuite, ModelCleanMixin applique Trip.clean(), qui refuse de raccourcir un voyage
        # si des destinations sortent de ses dates.
        return super().validate(attrs)

    def create(self, validated_data):
        return create_trip(owner=self.context["request"].user, **validated_data)


class TripDetailSerializer(TripSerializer):
    """Voyage avec ses destinations et leurs activités (lecture seule)."""

    destinations = NestedDestinationSerializer(many=True, read_only=True)

    class Meta(TripSerializer.Meta):
        fields = [*TripSerializer.Meta.fields, "destinations"]


class TripCloneSerializer(serializers.Serializer):
    title = serializers.CharField(
        max_length=Trip._meta.get_field("title").max_length,
        required=False,
        help_text="Titre de la copie ; « Copie de <titre> » par défaut.",
    )


class CategoryStatsSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=Activity.Category.choices)
    label = serializers.CharField()
    count = serializers.IntegerField()
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    average_cost = serializers.DecimalField(max_digits=12, decimal_places=2)


class TripStatsSerializer(serializers.Serializer):
    trip = serializers.IntegerField()
    budget = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    remaining_budget = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        allow_null=True,
        help_text="Budget moins le coût total ; négatif en cas de dépassement, null sans budget.",
    )
    destination_count = serializers.IntegerField()
    activity_count = serializers.IntegerField()
    average_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        allow_null=True,
        help_text="Coût moyen d'une activité ; null sans activité.",
    )
    by_category = CategoryStatsSerializer(many=True)


class ParticipantSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    invited_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = TripParticipant
        fields = ["user", "role", "joined_at", "invited_by"]
        read_only_fields = fields


# Rôles possibles à l'ajout. Pour transférer la propriété, on change le rôle ensuite.
INVITABLE_ROLES = [
    (role, label)
    for role, label in TripParticipant.Role.choices
    if role != TripParticipant.Role.OWNER
]


class ParticipantCreateSerializer(serializers.Serializer):
    email = serializers.EmailField(help_text="Courriel d'un utilisateur inscrit.")
    role = serializers.ChoiceField(
        choices=INVITABLE_ROLES,
        default=TripParticipant.Role.VIEWER,
        help_text="Pour transférer la propriété, modifiez ensuite le rôle en owner.",
    )


class ParticipantRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=TripParticipant.Role.choices,
        help_text="owner transfère la propriété du voyage ; l'ancien propriétaire devient éditeur.",
    )
