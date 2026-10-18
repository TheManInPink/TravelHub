"""Permissions objet fondées sur le rôle de l'utilisateur dans un voyage.

Ces classes ne contrôlent que l'accès à un objet déjà trouvé. Les vues filtrent
d'abord leur queryset avec Trip.objects.visible_to() : un non-membre obtient donc
404 (le voyage « n'existe pas » pour lui), un membre sans le bon rôle obtient 403.

Elles acceptent un Trip ou tout objet rattaché à un voyage (Destination via
.trip, Activity via .destination.trip), pour servir aussi aux vues d'itinéraire.
"""

from rest_framework.permissions import BasePermission

from apps.trips.models import Trip, TripParticipant


def get_trip(obj):
    """Remonte au voyage auquel appartient obj."""
    for path in ((), ("trip",), ("destination", "trip")):
        candidate = obj
        for attr in path:
            candidate = getattr(candidate, attr, None)
        if isinstance(candidate, Trip):
            return candidate
    raise TypeError(f"{type(obj).__name__} n'est rattaché à aucun voyage.")


def _has_role(user, trip, roles):
    return trip.memberships.filter(user=user, role__in=roles).exists()


class IsTripMember(BasePermission):
    """Propriétaire ou participant du voyage, quel que soit son rôle."""

    message = "Vous ne participez pas à ce voyage."

    def has_object_permission(self, request, view, obj):
        trip = get_trip(obj)
        return trip.owner_id == request.user.pk or _has_role(
            request.user, trip, TripParticipant.Role.values
        )


class IsTripEditor(BasePermission):
    """Propriétaire ou participant au rôle owner/editor : peut modifier le voyage."""

    message = "Seuls le propriétaire et les éditeurs peuvent modifier ce voyage."

    def has_object_permission(self, request, view, obj):
        trip = get_trip(obj)
        return trip.owner_id == request.user.pk or _has_role(
            request.user, trip, TripParticipant.EDITOR_ROLES
        )


class IsTripOwner(BasePermission):
    """Propriétaire du voyage uniquement (suppression, gestion des participants)."""

    message = "Seul le propriétaire peut effectuer cette action sur ce voyage."

    def has_object_permission(self, request, view, obj):
        return get_trip(obj).owner_id == request.user.pk


class TripRolePermissionMixin:
    """Pour un ViewSet : ajoute aux permissions par défaut la permission objet de l'action.

    object_permission_by_action associe une action à IsTripEditor ou IsTripOwner ;
    les actions absentes (lectures) exigent IsTripMember.
    """

    object_permission_by_action = {}

    def get_object_permission_class(self):
        return self.object_permission_by_action.get(self.action, IsTripMember)

    def get_permissions(self):
        return [*super().get_permissions(), self.get_object_permission_class()()]
