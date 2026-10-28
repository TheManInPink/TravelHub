from datetime import date, time
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.itinerary.models import Activity, Destination


@pytest.mark.django_db
class TestDestinationConstraints:
    def test_departure_before_arrival_rejected_by_database(self, make_destination):
        with pytest.raises(IntegrityError, match="itinerary_destination_departure_after_arrival"):
            make_destination(arrival_date=date(2027, 6, 5), departure_date=date(2027, 6, 4))

    def test_departure_before_arrival_reported_by_full_clean(self, trip):
        destination = Destination(
            trip=trip,
            city="Tokyo",
            country="Japon",
            country_code="JP",
            order=1,
            arrival_date=date(2027, 6, 5),
            departure_date=date(2027, 6, 4),
        )
        with pytest.raises(ValidationError) as exc:
            destination.full_clean()
        assert "La date de départ doit être postérieure ou égale" in str(exc.value)

    def test_order_unique_within_trip(self, make_destination):
        make_destination(order=1)
        with pytest.raises(IntegrityError, match="itinerary_destination_unique_trip_order"):
            make_destination(order=1, city="Kyoto")

    def test_order_duplicate_reported_by_full_clean(self, destination):
        duplicate = Destination(
            trip=destination.trip,
            city="Kyoto",
            country="Japon",
            country_code="JP",
            order=destination.order,
            arrival_date=date(2027, 6, 8),
            departure_date=date(2027, 6, 9),
        )
        with pytest.raises(ValidationError) as exc:
            duplicate.full_clean()
        assert "Une destination occupe déjà cette position dans le voyage." in str(exc.value)

    def test_same_order_allowed_in_another_trip(self, make_trip, make_destination):
        make_destination(order=1)
        make_destination(order=1, trip=make_trip(title="Autre voyage"))
        assert Destination.objects.filter(order=1).count() == 2

    def test_country_code_normalized_to_uppercase(self, make_destination):
        assert make_destination(country_code=" jp ").country_code == "JP"

    def test_country_code_normalized_by_full_clean(self, trip):
        destination = Destination(
            trip=trip,
            city="Paris",
            country="France",
            country_code="fr",
            order=1,
            arrival_date=date(2027, 6, 1),
            departure_date=date(2027, 6, 2),
        )
        destination.full_clean()
        assert destination.country_code == "FR"

    @pytest.mark.parametrize("code", ["FRA", "F1", "F"])
    def test_invalid_country_code_rejected_by_full_clean(self, trip, code):
        destination = Destination(
            trip=trip,
            city="Paris",
            country="France",
            country_code=code,
            order=1,
            arrival_date=date(2027, 6, 1),
            departure_date=date(2027, 6, 2),
        )
        with pytest.raises(ValidationError) as exc:
            destination.full_clean()
        assert "country_code" in exc.value.message_dict

    def test_lowercase_country_code_rejected_by_database(self, destination):
        # update() ne passe pas par save(), donc seule la contrainte CHECK protège la base.
        with pytest.raises(IntegrityError, match="itinerary_destination_country_code_iso2"):
            Destination.objects.filter(pk=destination.pk).update(country_code="jp")

    def test_coordinates_out_of_range_rejected_by_database(self, make_destination):
        with pytest.raises(IntegrityError, match="itinerary_destination_coordinates_valid"):
            make_destination(latitude=Decimal("91"), longitude=Decimal("0"))

    def test_latitude_without_longitude_rejected_by_database(self, make_destination):
        with pytest.raises(IntegrityError, match="itinerary_destination_coordinates_valid"):
            make_destination(latitude=Decimal("35.6762"))

    def test_valid_coordinates_accepted(self, make_destination):
        tokyo = make_destination(latitude=Decimal("35.676200"), longitude=Decimal("139.650300"))
        tokyo.refresh_from_db()
        assert tokyo.latitude == Decimal("35.676200")

    def test_negative_order_rejected_by_database(self, make_destination):
        with pytest.raises(IntegrityError):
            make_destination(order=-1)


@pytest.mark.django_db
class TestDestinationCrossValidation:
    def test_arrival_before_trip_start_rejected(self, trip):
        destination = Destination(
            trip=trip,
            city="Séoul",
            country="Corée du Sud",
            country_code="KR",
            order=1,
            arrival_date=date(2027, 5, 30),
            departure_date=date(2027, 6, 2),
        )
        with pytest.raises(ValidationError) as exc:
            destination.full_clean()
        assert list(exc.value.message_dict) == ["arrival_date"]

    def test_departure_after_trip_end_rejected(self, trip):
        destination = Destination(
            trip=trip,
            city="Séoul",
            country="Corée du Sud",
            country_code="KR",
            order=1,
            arrival_date=date(2027, 6, 18),
            departure_date=date(2027, 6, 22),
        )
        with pytest.raises(ValidationError) as exc:
            destination.full_clean()
        assert "Le départ ne peut pas suivre la fin du voyage (2027-06-20)." in str(exc.value)

    def test_destination_on_trip_boundaries_accepted(self, trip):
        Destination(
            trip=trip,
            city="Tokyo",
            country="Japon",
            country_code="JP",
            order=1,
            arrival_date=trip.start_date,
            departure_date=trip.end_date,
        ).full_clean()

    def test_shrinking_dates_cannot_orphan_activities(self, destination, make_activity):
        make_activity(date=date(2027, 6, 6))
        destination.departure_date = date(2027, 6, 4)
        with pytest.raises(ValidationError, match="Des activités de cette destination sortent"):
            destination.full_clean()


@pytest.mark.django_db
class TestActivity:
    def test_negative_cost_rejected_by_database(self, make_activity):
        with pytest.raises(IntegrityError, match="itinerary_activity_cost_non_negative"):
            make_activity(cost=Decimal("-0.01"))

    def test_negative_cost_reported_by_full_clean(self, destination):
        activity = Activity(
            destination=destination,
            name="Musée",
            date=destination.arrival_date,
            cost=Decimal("-5.00"),
        )
        with pytest.raises(ValidationError) as exc:
            activity.full_clean()
        assert exc.value.message_dict["cost"][0] == "Le coût ne peut pas être négatif."

    def test_unknown_category_rejected_by_database(self, make_activity):
        with pytest.raises(IntegrityError, match="itinerary_activity_category_valid"):
            make_activity(category="party")

    def test_date_outside_destination_rejected(self, destination):
        activity = Activity(destination=destination, name="Musée", date=date(2027, 6, 8))
        with pytest.raises(ValidationError) as exc:
            activity.full_clean()
        assert "date" in exc.value.message_dict
        assert "Tokyo" in exc.value.message_dict["date"][0]

    def test_defaults_and_optional_start_time(self, make_activity):
        activity = make_activity()
        assert activity.cost == Decimal("0.00")
        assert activity.start_time is None

    def test_ordering_puts_untimed_activities_last(self, make_activity):
        untimed = make_activity(name="Flânerie")
        evening = make_activity(name="Dîner", start_time=time(19, 0))
        morning = make_activity(name="Marché", start_time=time(8, 30))
        assert list(Activity.objects.all()) == [morning, evening, untimed]


@pytest.mark.django_db
class TestCascades:
    def test_deleting_trip_deletes_itinerary(self, trip, make_activity):
        make_activity()
        trip.delete()
        assert not Destination.objects.exists()
        assert not Activity.objects.exists()

    def test_reverse_relations(self, trip, destination, make_activity):
        activity = make_activity()
        assert list(trip.destinations.all()) == [destination]
        assert list(destination.activities.all()) == [activity]
