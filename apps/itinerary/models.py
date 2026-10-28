from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import F, Q

from apps.core.models import TimeStampedModel

COUNTRY_CODE_PATTERN = r"^[A-Z]{2}$"


class Destination(TimeStampedModel):
    """Étape d'un voyage. C'est une ville visitée entre deux dates, à une position donnée."""

    trip = models.ForeignKey(
        "trips.Trip",
        on_delete=models.CASCADE,
        related_name="destinations",
        verbose_name="voyage",
    )
    city = models.CharField("ville", max_length=120)
    country = models.CharField("pays", max_length=120)
    country_code = models.CharField(
        "code pays (ISO 3166-1 alpha-2)",
        max_length=2,
        validators=[
            RegexValidator(
                COUNTRY_CODE_PATTERN,
                "Le code pays doit contenir exactement deux lettres (ISO 3166-1 alpha-2).",
            )
        ],
    )
    arrival_date = models.DateField("date d'arrivée")
    departure_date = models.DateField("date de départ")
    order = models.PositiveSmallIntegerField("ordre")
    latitude = models.DecimalField(
        "latitude",
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        "longitude",
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    class Meta:
        verbose_name = "destination"
        verbose_name_plural = "destinations"
        ordering = ["trip", "order"]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "order"],
                name="itinerary_destination_unique_trip_order",
                violation_error_message=(
                    "Une destination occupe déjà cette position dans le voyage."
                ),
            ),
            models.CheckConstraint(
                condition=Q(departure_date__gte=F("arrival_date")),
                name="itinerary_destination_departure_after_arrival",
                violation_error_message=(
                    "La date de départ doit être postérieure ou égale à la date d'arrivée."
                ),
            ),
            models.CheckConstraint(
                condition=Q(country_code__regex=COUNTRY_CODE_PATTERN),
                name="itinerary_destination_country_code_iso2",
                violation_error_message="Le code pays doit contenir deux lettres majuscules.",
            ),
            models.CheckConstraint(
                condition=Q(latitude__isnull=True, longitude__isnull=True)
                | Q(
                    # On met isnull=False, car un CHECK qui vaut NULL compte comme respecté.
                    latitude__isnull=False,
                    longitude__isnull=False,
                    latitude__gte=-90,
                    latitude__lte=90,
                    longitude__gte=-180,
                    longitude__lte=180,
                ),
                name="itinerary_destination_coordinates_valid",
                violation_error_message=(
                    "La latitude et la longitude doivent être fournies ensemble et être valides."
                ),
            ),
        ]

    def __str__(self):
        return f"{self.city} ({self.country_code})"

    def clean_fields(self, exclude=None):
        # On normalise avant les validateurs de champ (« fr » devient « FR »).
        if self.country_code:
            self.country_code = self.country_code.strip().upper()
        super().clean_fields(exclude=exclude)

    def clean(self):
        super().clean()
        if not (self.trip_id and self.arrival_date and self.departure_date):
            return
        trip = self.trip
        errors = {}
        if self.arrival_date < trip.start_date:
            errors["arrival_date"] = (
                f"L'arrivée ne peut pas précéder le début du voyage ({trip.start_date:%Y-%m-%d})."
            )
        if self.departure_date > trip.end_date:
            errors["departure_date"] = (
                f"Le départ ne peut pas suivre la fin du voyage ({trip.end_date:%Y-%m-%d})."
            )
        if errors:
            raise ValidationError(errors)
        # Si on réduit la période, aucune activité ne doit se retrouver en dehors.
        if self.pk:
            outside = self.activities.exclude(date__range=(self.arrival_date, self.departure_date))
            if outside.exists():
                raise ValidationError(
                    "Des activités de cette destination sortent des nouvelles dates : "
                    "modifiez-les avant de changer les dates de la destination."
                )

    def save(self, *args, **kwargs):
        # L'ORM n'appelle pas clean_fields() à la création, donc on normalise aussi ici.
        if self.country_code:
            self.country_code = self.country_code.strip().upper()
        super().save(*args, **kwargs)


class ActivityCategory(models.TextChoices):
    SIGHTSEEING = "sightseeing", "Visite"
    CULTURE = "culture", "Culture"
    FOOD = "food", "Restauration"
    NATURE = "nature", "Nature"
    SPORT = "sport", "Sport"
    TRANSPORT = "transport", "Transport"
    ACCOMMODATION = "accommodation", "Hébergement"
    OTHER = "other", "Autre"


class Activity(TimeStampedModel):
    """Activité prévue pendant le séjour à une destination."""

    Category = ActivityCategory

    destination = models.ForeignKey(
        Destination,
        on_delete=models.CASCADE,
        related_name="activities",
        verbose_name="destination",
    )
    name = models.CharField("nom", max_length=200)
    description = models.TextField("description", blank=True)
    category = models.CharField(
        "catégorie", max_length=20, choices=Category, default=Category.OTHER
    )
    date = models.DateField("date")
    start_time = models.TimeField("heure de début", null=True, blank=True)
    cost = models.DecimalField(
        "coût",
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(0, "Le coût ne peut pas être négatif.")],
    )

    class Meta:
        verbose_name = "activité"
        verbose_name_plural = "activités"
        ordering = ["date", F("start_time").asc(nulls_last=True), "pk"]
        constraints = [
            models.CheckConstraint(
                condition=Q(cost__gte=0),
                name="itinerary_activity_cost_non_negative",
                violation_error_message="Le coût ne peut pas être négatif.",
            ),
            models.CheckConstraint(
                condition=Q(category__in=ActivityCategory.values),
                name="itinerary_activity_category_valid",
                violation_error_message="Catégorie d'activité invalide.",
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if not (self.destination_id and self.date):
            return
        destination = self.destination
        if not destination.arrival_date <= self.date <= destination.departure_date:
            raise ValidationError(
                {
                    "date": (
                        "La date de l'activité doit être comprise dans le séjour à "
                        f"{destination.city} ({destination.arrival_date:%Y-%m-%d} au "
                        f"{destination.departure_date:%Y-%m-%d})."
                    )
                }
            )
