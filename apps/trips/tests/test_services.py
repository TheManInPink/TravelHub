from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.itinerary.models import Activity, Destination
from apps.trips.models import Trip, TripParticipant
from apps.trips.services import clone_trip, create_trip, ensure_owner_membership


def row_counts():
    return {
        model.__name__: model.objects.count()
        for model in (Trip, TripParticipant, Destination, Activity)
    }


@pytest.mark.django_db
class TestCloneTrip:
    @pytest.fixture
    def source(self, trip, destination, make_activity):
        make_activity(cost=Decimal("12.00"))
        make_activity(name="Shibuya", cost=Decimal("0.00"))
        return trip

    def test_copies_everything_for_new_owner(self, source, make_user):
        alice = make_user("alice")

        copy = clone_trip(source, owner=alice)

        assert copy.owner == alice
        assert copy.title == "Copie de Voyage au Japon"
        assert [d.city for d in copy.destinations.all()] == ["Tokyo"]
        assert Activity.objects.filter(destination__trip=copy).count() == 2
        assert list(copy.participants.all()) == [alice]

    def test_long_title_is_truncated(self, source, owner):
        source.title = "x" * 200
        source.save()
        assert len(clone_trip(source, owner=owner).title) == 200

    def test_failure_midway_rolls_everything_back(self, source, owner, monkeypatch):
        """Exemple de transaction.atomic. Si la copie des activités échoue, le voyage, son
        participant owner et les destinations déjà insérés sont aussi annulés."""
        before = row_counts()
        inserted = {}

        def failing_bulk_create(objs, *args, **kwargs):
            # Les lignes précédentes existent bien à ce moment, dans la transaction.
            inserted.update(row_counts())
            raise RuntimeError("panne simulée pendant la copie des activités")

        monkeypatch.setattr(Activity.objects, "bulk_create", failing_bulk_create)

        with pytest.raises(RuntimeError, match="panne simulée"):
            clone_trip(source, owner=owner)

        assert inserted == {**before, "Trip": 2, "TripParticipant": 2, "Destination": 2}
        assert row_counts() == before
        assert not Trip.objects.filter(title="Copie de Voyage au Japon").exists()


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
