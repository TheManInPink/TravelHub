from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.trips.models import Trip, TripParticipant


@pytest.mark.django_db
class TestTripConstraints:
    def test_end_before_start_rejected_by_database(self, owner):
        with pytest.raises(IntegrityError, match="trips_trip_end_after_start"):
            Trip.objects.create(
                owner=owner, title="X", start_date=date(2027, 6, 10), end_date=date(2027, 6, 1)
            )

    def test_end_before_start_reported_by_full_clean(self, owner):
        trip = Trip(owner=owner, title="X", start_date=date(2027, 6, 10), end_date=date(2027, 6, 1))
        with pytest.raises(ValidationError) as exc:
            trip.full_clean()
        assert "La date de fin doit être postérieure ou égale à la date de début." in str(exc.value)

    def test_single_day_trip_allowed(self, owner):
        day = date(2027, 6, 1)
        Trip(owner=owner, title="Aller-retour", start_date=day, end_date=day).full_clean()

    def test_negative_budget_rejected_by_database(self, owner):
        with pytest.raises(IntegrityError, match="trips_trip_budget_non_negative"):
            Trip.objects.create(
                owner=owner,
                title="X",
                start_date=date(2027, 6, 1),
                end_date=date(2027, 6, 2),
                budget=Decimal("-1.00"),
            )

    def test_negative_budget_reported_by_full_clean(self, owner):
        trip = Trip(
            owner=owner,
            title="X",
            start_date=date(2027, 6, 1),
            end_date=date(2027, 6, 2),
            budget=Decimal("-1.00"),
        )
        with pytest.raises(ValidationError) as exc:
            trip.full_clean()
        assert "budget" in exc.value.message_dict

    def test_budget_is_optional(self, trip):
        assert trip.budget is None

    def test_unknown_status_rejected_by_database(self, trip):
        with pytest.raises(IntegrityError, match="trips_trip_status_valid"):
            Trip.objects.filter(pk=trip.pk).update(status="lost")

    def test_shrinking_dates_cannot_orphan_destinations(self, trip, make_destination):
        make_destination(arrival_date=date(2027, 6, 15), departure_date=date(2027, 6, 18))
        trip.end_date = date(2027, 6, 10)
        with pytest.raises(ValidationError, match="Des destinations de ce voyage sortent"):
            trip.full_clean()


@pytest.mark.django_db
class TestTripParticipantConstraints:
    def test_same_user_cannot_join_twice(self, trip, make_user):
        guest = make_user()
        TripParticipant.objects.create(trip=trip, user=guest)
        with pytest.raises(IntegrityError, match="trips_participant_unique_trip_user"):
            TripParticipant.objects.create(trip=trip, user=guest, role=TripParticipant.Role.EDITOR)

    def test_duplicate_reported_by_full_clean(self, trip, owner):
        duplicate = TripParticipant(trip=trip, user=owner, role=TripParticipant.Role.VIEWER)
        with pytest.raises(ValidationError) as exc:
            duplicate.full_clean()
        assert "Cet utilisateur participe déjà à ce voyage." in str(exc.value)

    def test_only_one_owner_per_trip(self, trip, make_user):
        with pytest.raises(IntegrityError, match="trips_participant_single_owner"):
            TripParticipant.objects.create(
                trip=trip, user=make_user(), role=TripParticipant.Role.OWNER
            )

    def test_unknown_role_rejected_by_database(self, trip, make_user):
        with pytest.raises(IntegrityError, match="trips_participant_role_valid"):
            TripParticipant.objects.create(trip=trip, user=make_user(), role="admin")

    def test_inviter_deletion_keeps_membership(self, trip, make_user):
        inviter, guest = make_user(), make_user()
        membership = TripParticipant.objects.create(trip=trip, user=guest, invited_by=inviter)
        inviter.delete()
        membership.refresh_from_db()
        assert membership.invited_by is None


@pytest.mark.django_db
class TestTripRelations:
    def test_many_to_many_through_participants(self, trip, owner, make_user):
        guest = make_user()
        TripParticipant.objects.create(trip=trip, user=guest, invited_by=owner)
        assert set(trip.participants.all()) == {owner, guest}
        assert list(guest.trips.all()) == [trip]
        assert list(owner.owned_trips.all()) == [trip]
        assert not guest.owned_trips.exists()

    def test_deleting_trip_cascades_to_memberships(self, trip):
        trip.delete()
        assert not TripParticipant.objects.exists()

    def test_deleting_owner_cascades_to_trips(self, trip, owner):
        owner.delete()
        assert not Trip.objects.exists()

    def test_participant_can_edit(self, trip, make_user):
        viewer = TripParticipant.objects.create(trip=trip, user=make_user())
        editor = TripParticipant.objects.create(
            trip=trip, user=make_user(), role=TripParticipant.Role.EDITOR
        )
        assert trip.memberships.get(role=TripParticipant.Role.OWNER).can_edit
        assert editor.can_edit
        assert not viewer.can_edit

    def test_str(self, trip):
        assert str(trip) == "Voyage au Japon"
        assert str(trip.memberships.get()) == "owner — Voyage au Japon (Propriétaire)"
