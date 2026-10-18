from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from apps.trips.models import Trip, TripParticipant

Role = TripParticipant.Role


@pytest.fixture
def members(trip, make_user):
    """Un éditeur, un lecteur et un utilisateur étranger au voyage."""
    editor, viewer, stranger = make_user("editor"), make_user("viewer"), make_user("stranger")
    TripParticipant.objects.create(trip=trip, user=editor, role=Role.EDITOR)
    TripParticipant.objects.create(trip=trip, user=viewer, role=Role.VIEWER)
    return {"editor": editor, "viewer": viewer, "stranger": stranger}


@pytest.mark.django_db
class TestVisibleTo:
    def test_owner_and_all_participants_see_trip(self, trip, owner, members):
        for user in (owner, members["editor"], members["viewer"]):
            assert list(Trip.objects.visible_to(user)) == [trip]

    def test_stranger_sees_nothing(self, trip, members):
        assert not Trip.objects.visible_to(members["stranger"]).exists()

    def test_anonymous_sees_nothing(self, trip):
        assert not Trip.objects.visible_to(AnonymousUser()).exists()
        assert not Trip.objects.visible_to(None).exists()

    def test_owner_without_membership_row_still_sees_trip(self, owner):
        # Voyage créé hors service (ex. script) : le propriétaire garde l'accès.
        orphan = Trip.objects.create(
            owner=owner, title="Brut", start_date=date(2027, 1, 1), end_date=date(2027, 1, 2)
        )
        assert orphan in Trip.objects.visible_to(owner)

    def test_no_duplicates_with_many_participants(self, trip, owner, members):
        assert Trip.objects.visible_to(owner).count() == 1


@pytest.mark.django_db
class TestEditableBy:
    def test_owner_and_editor_can_edit(self, trip, owner, members):
        assert list(Trip.objects.editable_by(owner)) == [trip]
        assert list(Trip.objects.editable_by(members["editor"])) == [trip]

    def test_viewer_and_stranger_cannot_edit(self, trip, members):
        assert not Trip.objects.editable_by(members["viewer"]).exists()
        assert not Trip.objects.editable_by(members["stranger"]).exists()

    def test_anonymous_cannot_edit(self, trip):
        assert not Trip.objects.editable_by(AnonymousUser()).exists()


@pytest.mark.django_db
class TestUpcoming:
    def test_keeps_future_active_trips_in_start_order(self, make_trip):
        today = timezone.localdate()
        later = make_trip(
            title="Plus tard",
            start_date=today + timedelta(days=30),
            end_date=today + timedelta(days=35),
        )
        soon = make_trip(title="Aujourd'hui", start_date=today, end_date=today + timedelta(days=2))
        make_trip(
            title="Passé", start_date=today - timedelta(days=10), end_date=today - timedelta(days=5)
        )
        make_trip(
            title="Annulé",
            status=Trip.Status.CANCELLED,
            start_date=today + timedelta(days=3),
            end_date=today + timedelta(days=4),
        )
        assert list(Trip.objects.upcoming()) == [soon, later]


@pytest.mark.django_db
class TestWithTotals:
    def test_empty_trip_has_zero_totals(self, trip):
        totals = Trip.objects.with_totals().get(pk=trip.pk)
        assert totals.destination_count == 0
        assert totals.activity_count == 0
        assert totals.total_cost == Decimal("0.00")

    def test_counts_and_sums_across_destinations(
        self, trip, destination, make_destination, make_activity
    ):
        tokyo = destination
        kyoto = make_destination(
            city="Kyoto", arrival_date=date(2027, 6, 8), departure_date=date(2027, 6, 12)
        )
        make_destination(
            city="Osaka", arrival_date=date(2027, 6, 13), departure_date=date(2027, 6, 15)
        )
        make_activity(destination=tokyo, cost=Decimal("25.50"))
        make_activity(destination=tokyo, name="Shibuya", cost=Decimal("0.00"))
        make_activity(
            destination=kyoto, name="Fushimi Inari", date=date(2027, 6, 9), cost=Decimal("100.00")
        )
        totals = Trip.objects.with_totals().get(pk=trip.pk)
        assert totals.destination_count == 3
        assert totals.activity_count == 3
        assert totals.total_cost == Decimal("125.50")

    def test_combined_with_visibility_filter_is_not_inflated(
        self, trip, members, make_destination, make_activity
    ):
        make_activity(destination=make_destination(), cost=Decimal("40.00"))
        totals = Trip.objects.visible_to(members["viewer"]).with_totals().get()
        assert totals.total_cost == Decimal("40.00")
        assert totals.activity_count == 1
