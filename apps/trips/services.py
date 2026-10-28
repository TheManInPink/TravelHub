"""Opérations métier sur les voyages.

La création passe par un service explicite plutôt que par un signal post_save. Comme
ça, on voit à l'appel que le propriétaire est ajouté comme participant, et cet ajout
se fait dans la même transaction que la création du voyage.

Les services lèvent des ValidationError de Django. Le gestionnaire d'exceptions de
l'API (apps.core.exceptions) les transforme en réponses 400.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Sum

from apps.itinerary.models import Activity, Destination

from .models import Trip, TripParticipant

Role = TripParticipant.Role

LAST_OWNER_MESSAGE = (
    "Un voyage doit garder son propriétaire : donnez d'abord le rôle owner à un autre participant."
)


@transaction.atomic
def create_trip(*, owner, **fields) -> Trip:
    """Crée un voyage validé et inscrit son propriétaire comme participant « owner »."""
    trip = Trip(owner=owner, **fields)
    trip.full_clean()
    trip.save()
    TripParticipant.objects.create(trip=trip, user=owner, role=TripParticipant.Role.OWNER)
    return trip


@transaction.atomic
def ensure_owner_membership(trip: Trip) -> TripParticipant:
    """Aligne le participant « owner » sur trip.owner, par exemple après un transfert.

    S'il y avait un ancien propriétaire, il reste participant avec le rôle editor.
    """
    trip.memberships.filter(role=TripParticipant.Role.OWNER).exclude(user=trip.owner).update(
        role=TripParticipant.Role.EDITOR
    )
    membership, _ = TripParticipant.objects.update_or_create(
        trip=trip,
        user=trip.owner,
        defaults={"role": TripParticipant.Role.OWNER},
    )
    return membership


def _copy(instance, **overrides):
    """Copie non enregistrée des valeurs d'instance, sans clé ni horodatage."""
    skipped = {"id", "created_at", "updated_at"}
    for name in overrides:
        skipped |= {name, instance._meta.get_field(name).attname}
    values = {
        field.attname: getattr(instance, field.attname)
        for field in instance._meta.concrete_fields
        if field.name not in skipped and field.attname not in skipped
    }
    return type(instance)(**values, **overrides)


@transaction.atomic
def clone_trip(source: Trip, *, owner, title=None) -> Trip:
    """Copie un voyage, ses destinations et leurs activités pour owner.

    La copie est un brouillon et owner en est le seul participant. Tout se passe dans une
    transaction, donc si une étape échoue, aucune ligne n'est créée.
    """
    title_field = Trip._meta.get_field("title")
    trip = create_trip(
        owner=owner,
        title=title or f"Copie de {source.title}"[: title_field.max_length],
        description=source.description,
        start_date=source.start_date,
        end_date=source.end_date,
        budget=source.budget,
        status=Trip.Status.DRAFT,
    )
    destinations = list(source.destinations.prefetch_related("activities"))
    # Avec PostgreSQL, bulk_create renvoie les clés primaires. On peut donc utiliser
    # les copies comme parents.
    copies = Destination.objects.bulk_create(_copy(d, trip=trip) for d in destinations)
    Activity.objects.bulk_create(
        _copy(activity, destination=copy)
        for original, copy in zip(destinations, copies, strict=True)
        for activity in original.activities.all()
    )
    return trip


def compute_trip_stats(trip: Trip) -> dict:
    """Budget, coûts et activités par catégorie, calculés par la base (Sum, Count, Avg)."""
    activities = Activity.objects.filter(destination__trip=trip)
    totals = activities.aggregate(count=Count("pk"), total=Sum("cost"), average=Avg("cost"))
    total_cost = totals["total"] or Decimal("0")
    by_category = (
        activities.values("category")
        .annotate(count=Count("pk"), total_cost=Sum("cost"), average_cost=Avg("cost"))
        # Tri explicite, sinon l'ordre par défaut d'Activity ajouterait date au GROUP BY.
        .order_by("-total_cost", "category")
    )
    return {
        "trip": trip.pk,
        "budget": trip.budget,
        "total_cost": total_cost,
        "remaining_budget": None if trip.budget is None else trip.budget - total_cost,
        "destination_count": trip.destinations.count(),
        "activity_count": totals["count"],
        "average_cost": totals["average"],
        "by_category": [
            {**row, "label": Activity.Category(row["category"]).label} for row in by_category
        ],
    }


def add_participant(trip: Trip, *, email, role, invited_by) -> TripParticipant:
    """Ajoute au voyage l'utilisateur qui a ce courriel."""
    user = get_user_model().objects.filter(email__iexact=email.strip()).first()
    if user is None:
        raise ValidationError({"email": "Aucun utilisateur n'a ce courriel."})
    if user.pk == trip.owner_id:
        raise ValidationError({"email": "Cet utilisateur est déjà le propriétaire du voyage."})
    # Un doublon viole trips_participant_unique_trip_user et l'IntegrityError devient
    # un 400. Comme c'est la base qui vérifie, deux ajouts simultanés ne posent pas de
    # problème. Le point de sauvegarde permet de continuer la transaction englobante.
    with transaction.atomic():
        return TripParticipant.objects.create(
            trip=trip, user=user, role=role, invited_by=invited_by
        )


def _is_owner(membership: TripParticipant) -> bool:
    return membership.role == Role.OWNER or membership.user_id == membership.trip.owner_id


@transaction.atomic
def change_participant_role(membership: TripParticipant, role) -> TripParticipant:
    """Change le rôle d'un participant. Le rôle owner transfère la propriété du voyage.

    L'ancien propriétaire devient alors éditeur. On ne peut pas rétrograder directement
    le propriétaire actuel, sinon le voyage n'aurait plus de propriétaire.
    """
    if _is_owner(membership):
        if role != Role.OWNER:
            raise ValidationError({"role": LAST_OWNER_MESSAGE})
        return membership
    if role == Role.OWNER:
        trip = membership.trip
        trip.owner = membership.user
        trip.save(update_fields=["owner", "updated_at"])
        return ensure_owner_membership(trip)
    membership.role = role
    membership.save(update_fields=["role"])
    return membership


def remove_participant(membership: TripParticipant) -> None:
    """Retire un participant. Le propriétaire ne peut pas être retiré."""
    if _is_owner(membership):
        raise ValidationError(LAST_OWNER_MESSAGE)
    membership.delete()
