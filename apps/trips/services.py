"""Opérations métier sur les voyages.

La création passe par un service explicite plutôt que par un signal post_save :
l'effet de bord (ajout du participant propriétaire) est visible à l'appel et
s'exécute dans la même transaction que la création du voyage.
"""

from django.db import transaction

from .models import Trip, TripParticipant


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
    """Aligne le participant « owner » sur trip.owner (utile après un changement de propriétaire).

    L'ancien propriétaire, s'il y en a un, reste participant avec le rôle editor.
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
