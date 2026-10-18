from types import SimpleNamespace

import pytest

from apps.core.permissions import IsTripEditor, IsTripMember, IsTripOwner, get_trip
from apps.trips.models import TripParticipant

Role = TripParticipant.Role


def allowed(permission_class, user, obj):
    request = SimpleNamespace(user=user)
    return permission_class().has_object_permission(request, None, obj)


@pytest.mark.django_db
class TestGetTrip:
    def test_resolves_trip_destination_and_activity(self, trip, destination, make_activity):
        activity = make_activity()
        assert get_trip(trip) == trip
        assert get_trip(destination) == trip
        assert get_trip(activity) == trip

    def test_rejects_unrelated_object(self, owner):
        with pytest.raises(TypeError):
            get_trip(owner)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("role", "member", "editor", "owner_only"),
    [
        ("owner", True, True, True),
        (Role.EDITOR, True, True, False),
        (Role.VIEWER, True, False, False),
        (None, False, False, False),
    ],
)
def test_permissions_by_role(trip, owner, make_user, role, member, editor, owner_only):
    if role == "owner":
        user = owner
    else:
        user = make_user()
        if role is not None:
            TripParticipant.objects.create(trip=trip, user=user, role=role)

    assert allowed(IsTripMember, user, trip) is member
    assert allowed(IsTripEditor, user, trip) is editor
    assert allowed(IsTripOwner, user, trip) is owner_only


@pytest.mark.django_db
def test_permissions_apply_to_child_objects(trip, destination, make_user):
    viewer = make_user()
    TripParticipant.objects.create(trip=trip, user=viewer, role=Role.VIEWER)
    assert allowed(IsTripMember, viewer, destination)
    assert not allowed(IsTripEditor, viewer, destination)


@pytest.mark.django_db
def test_owner_field_wins_even_without_membership_row(trip, owner):
    # Le rôle « owner » vient de Trip.owner, pas seulement de la table d'association.
    trip.memberships.all().delete()
    assert allowed(IsTripOwner, owner, trip)
    assert allowed(IsTripEditor, owner, trip)
