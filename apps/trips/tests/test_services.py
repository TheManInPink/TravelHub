from datetime import date

import pytest
from django.core.exceptions import ValidationError

from apps.trips.models import Trip, TripParticipant
from apps.trips.services import create_trip, ensure_owner_membership


@pytest.mark.django_db
class TestCreateTrip:
    def test_owner_becomes_owner_participant(self, owner):
        trip = create_trip(
            owner=owner, title="Islande", start_date=date(2027, 7, 1), end_date=date(2027, 7, 9)
        )
        membership = TripParticipant.objects.get(trip=trip)
        assert membership.user == owner
        assert membership.role == TripParticipant.Role.OWNER
        assert membership.invited_by is None
        assert list(trip.participants.all()) == [owner]

    def test_invalid_trip_creates_nothing(self, owner):
        with pytest.raises(ValidationError):
            create_trip(
                owner=owner, title="X", start_date=date(2027, 7, 9), end_date=date(2027, 7, 1)
            )
        assert not Trip.objects.exists()
        assert not TripParticipant.objects.exists()

    def test_missing_title_rejected(self, owner):
        with pytest.raises(ValidationError) as exc:
            create_trip(
                owner=owner, title="", start_date=date(2027, 7, 1), end_date=date(2027, 7, 1)
            )
        assert "title" in exc.value.message_dict


@pytest.mark.django_db
class TestEnsureOwnerMembership:
    def test_is_idempotent(self, trip, owner):
        ensure_owner_membership(trip)
        ensure_owner_membership(trip)
        assert trip.memberships.get().user == owner

    def test_owner_change_demotes_previous_owner(self, trip, owner, make_user):
        new_owner = make_user()
        trip.owner = new_owner
        trip.save()
        ensure_owner_membership(trip)
        roles = dict(trip.memberships.values_list("user__username", "role"))
        assert roles == {owner.username: "editor", new_owner.username: "owner"}

    def test_promotes_existing_participant(self, trip, make_user):
        editor = make_user()
        TripParticipant.objects.create(trip=trip, user=editor, role=TripParticipant.Role.EDITOR)
        trip.owner = editor
        trip.save()
        ensure_owner_membership(trip)
        assert trip.memberships.get(role=TripParticipant.Role.OWNER).user == editor
        assert trip.memberships.count() == 2
