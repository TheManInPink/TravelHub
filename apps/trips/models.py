from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Count, DecimalField, Exists, F, OuterRef, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.models import TimeStampedModel


# Choix définis au niveau du module : la classe Meta ne voit pas les attributs
# de la classe englobante, or les CheckConstraint en ont besoin.
class TripStatus(models.TextChoices):
    DRAFT = "draft", "Brouillon"
    PLANNED = "planned", "Planifié"
    ONGOING = "ongoing", "En cours"
    COMPLETED = "completed", "Terminé"
    CANCELLED = "cancelled", "Annulé"


class ParticipantRole(models.TextChoices):
    OWNER = "owner", "Propriétaire"
    EDITOR = "editor", "Éditeur"
    VIEWER = "viewer", "Lecteur"


class TripQuerySet(models.QuerySet):
    """Requêtes réutilisables sur les voyages (exposées par Trip.objects)."""

    def visible_to(self, user):
        """Voyages dont l'utilisateur est propriétaire ou participant, quel que soit son rôle."""
        if user is None or not user.is_authenticated:
            return self.none()
        # Exists() plutôt qu'une jointure : aucun doublon, et with_totals() reste exact.
        membership = TripParticipant.objects.filter(trip=OuterRef("pk"), user=user)
        return self.filter(Q(owner=user) | Exists(membership))

    def editable_by(self, user):
        """Voyages que l'utilisateur peut modifier : propriétaire ou rôle owner/editor."""
        if user is None or not user.is_authenticated:
            return self.none()
        membership = TripParticipant.objects.filter(
            trip=OuterRef("pk"),
            user=user,
            role__in=TripParticipant.EDITOR_ROLES,
        )
        return self.filter(Q(owner=user) | Exists(membership))

    def upcoming(self):
        """Voyages qui commencent aujourd'hui ou plus tard, hors voyages annulés ou terminés."""
        return (
            self.filter(start_date__gte=timezone.localdate())
            .exclude(status__in=[Trip.Status.CANCELLED, Trip.Status.COMPLETED])
            .order_by("start_date", "pk")
        )

    def with_totals(self):
        """Ajoute destination_count, activity_count et total_cost (somme des coûts d'activités).

        Les jointures destinations -> activités forment une chaîne 1-N : chaque activité
        n'apparaît qu'une fois, donc Sum() n'est pas gonflée. Ne pas ajouter ici un Count()
        sur une autre relation (participants) : la seconde jointure multiplierait les lignes.
        """
        return self.annotate(
            destination_count=Count("destinations", distinct=True),
            activity_count=Count("destinations__activities", distinct=True),
            total_cost=Coalesce(
                Sum("destinations__activities__cost"),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
        )


class Trip(TimeStampedModel):
    """Voyage planifié par un propriétaire et partagé avec des participants."""

    Status = TripStatus

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_trips",
        verbose_name="propriétaire",
    )
    title = models.CharField("titre", max_length=200)
    description = models.TextField("description", blank=True)
    start_date = models.DateField("date de début")
    end_date = models.DateField("date de fin")
    status = models.CharField("statut", max_length=20, choices=Status, default=Status.DRAFT)
    budget = models.DecimalField(
        "budget",
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0, "Le budget ne peut pas être négatif.")],
    )
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="TripParticipant",
        # TripParticipant a deux FK vers User (user, invited_by) : on indique lesquelles
        # relient le voyage à ses participants.
        through_fields=("trip", "user"),
        related_name="trips",
        verbose_name="participants",
    )

    objects = TripQuerySet.as_manager()

    class Meta:
        verbose_name = "voyage"
        verbose_name_plural = "voyages"
        ordering = ["start_date", "pk"]
        indexes = [models.Index(fields=["start_date"], name="trips_trip_start_date_idx")]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F("start_date")),
                name="trips_trip_end_after_start",
                violation_error_message=(
                    "La date de fin doit être postérieure ou égale à la date de début."
                ),
            ),
            models.CheckConstraint(
                condition=Q(budget__isnull=True) | Q(budget__gte=0),
                name="trips_trip_budget_non_negative",
                violation_error_message="Le budget ne peut pas être négatif.",
            ),
            models.CheckConstraint(
                condition=Q(status__in=TripStatus.values),
                name="trips_trip_status_valid",
                violation_error_message="Statut de voyage invalide.",
            ),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        super().clean()
        # Raccourcir le voyage ne doit pas laisser des destinations hors de ses dates.
        if self.pk and self.start_date and self.end_date:
            outside = self.destinations.filter(
                Q(arrival_date__lt=self.start_date) | Q(departure_date__gt=self.end_date)
            )
            if outside.exists():
                raise ValidationError(
                    "Des destinations de ce voyage sortent des nouvelles dates : "
                    "modifiez-les avant de changer les dates du voyage."
                )


class TripParticipant(models.Model):
    """Table d'association User <-> Trip portant le rôle du participant."""

    Role = ParticipantRole

    EDITOR_ROLES = (Role.OWNER, Role.EDITOR)

    trip = models.ForeignKey(
        Trip,
        on_delete=models.CASCADE,
        related_name="memberships",
        verbose_name="voyage",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trip_memberships",
        verbose_name="utilisateur",
    )
    role = models.CharField("rôle", max_length=10, choices=Role, default=Role.VIEWER)
    joined_at = models.DateTimeField("ajouté le", default=timezone.now)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_trip_invitations",
        verbose_name="invité par",
    )

    class Meta:
        verbose_name = "participant"
        verbose_name_plural = "participants"
        ordering = ["trip", "joined_at", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "user"],
                name="trips_participant_unique_trip_user",
                violation_error_message="Cet utilisateur participe déjà à ce voyage.",
            ),
            # Index unique partiel PostgreSQL : au plus un participant « owner » par voyage.
            models.UniqueConstraint(
                fields=["trip"],
                condition=Q(role="owner"),
                name="trips_participant_single_owner",
                violation_error_message="Ce voyage a déjà un propriétaire.",
            ),
            models.CheckConstraint(
                condition=Q(role__in=ParticipantRole.values),
                name="trips_participant_role_valid",
                violation_error_message="Rôle de participant invalide.",
            ),
        ]

    def __str__(self):
        return f"{self.user} — {self.trip} ({self.get_role_display()})"

    @property
    def can_edit(self):
        return self.role in self.EDITOR_ROLES
