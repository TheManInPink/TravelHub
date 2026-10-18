from datetime import date

import pytest
from django.urls import reverse

from apps.core.testing import error_of
from apps.itinerary.models import Destination
from apps.trips.models import TripParticipant

LIST_URL = reverse("destination-list")


def detail_url(destination):
    return reverse("destination-detail", args=[destination.pk])


@pytest.fixture
def payload(trip):
    # Le voyage de la fixture trip va du 1er au 20 juin 2027.
    return {
        "trip": trip.pk,
        "order": 2,
        "city": "Kyoto",
        "country": "Japon",
        "country_code": "jp",
        "arrival_date": "2027-06-08",
        "departure_date": "2027-06-12",
        "latitude": "35.011600",
        "longitude": "135.768100",
    }


@pytest.mark.django_db
class TestAuthenticationRequired:
    def test_list(self, api_client):
        assert api_client.get(LIST_URL).status_code == 401

    def test_detail(self, api_client, destination):
        assert api_client.get(detail_url(destination)).status_code == 401

    def test_create(self, api_client, payload):
        assert api_client.post(LIST_URL, payload).status_code == 401
        assert not Destination.objects.exists()


@pytest.mark.django_db
class TestCreate:
    @pytest.mark.parametrize("who", ["owner", "editor"])
    def test_owner_and_editor_can_create(self, client_for, owner, members, payload, who):
        user = owner if who == "owner" else members[who]

        response = client_for(user).post(LIST_URL, payload)

        assert response.status_code == 201
        assert response.data["city"] == "Kyoto"
        assert response.data["country_code"] == "JP"  # normalisé
        assert Destination.objects.get(pk=response.data["id"]).trip_id == payload["trip"]

    def test_viewer_gets_403(self, client_for, members, payload):
        response = client_for(members["viewer"]).post(LIST_URL, payload)
        assert response.status_code == 403
        assert error_of(response)["code"] == "permission_denied"
        assert not Destination.objects.exists()

    def test_403_wins_over_validation_errors(self, client_for, members, payload):
        response = client_for(members["viewer"]).post(LIST_URL, {**payload, "city": ""})
        assert response.status_code == 403

    def test_stranger_gets_404(self, client_for, members, payload):
        response = client_for(members["stranger"]).post(LIST_URL, payload)
        assert response.status_code == 404
        assert error_of(response)["message"] == "Voyage introuvable."
        assert not Destination.objects.exists()

    def test_unknown_trip_gets_404_like_a_foreign_one(self, client_for, owner, payload):
        response = client_for(owner).post(LIST_URL, {**payload, "trip": 999999})
        assert response.status_code == 404

    @pytest.mark.parametrize(
        ("changes", "field"),
        [
            ({"arrival_date": "2027-05-30"}, "arrival_date"),
            ({"departure_date": "2027-06-25"}, "departure_date"),
            ({"country_code": "JPN"}, "country_code"),
            ({"country_code": "J1"}, "country_code"),
            ({"city": ""}, "city"),
            ({"latitude": "91"}, "latitude"),
            ({"trip": "abc"}, "trip"),
        ],
    )
    def test_invalid_fields_give_400(self, client_for, owner, payload, changes, field):
        response = client_for(owner).post(LIST_URL, {**payload, **changes})
        assert response.status_code == 400
        assert field in error_of(response)["details"]

    def test_departure_before_arrival_is_a_400_not_a_500(self, client_for, owner, payload):
        # Seule la CheckConstraint le vérifie : ModelCleanMixin l'applique avant l'INSERT.
        response = client_for(owner).post(
            LIST_URL, {**payload, "arrival_date": "2027-06-12", "departure_date": "2027-06-08"}
        )
        assert response.status_code == 400
        assert error_of(response)["details"]["non_field_errors"] == [
            "La date de départ doit être postérieure ou égale à la date d'arrivée."
        ]

    def test_order_must_be_unique_in_trip(self, client_for, owner, destination, payload):
        response = client_for(owner).post(LIST_URL, {**payload, "order": destination.order})
        assert response.status_code == 400
        assert "non_field_errors" in error_of(response)["details"]

    def test_coordinates_go_together(self, client_for, owner, payload):
        del payload["longitude"]
        response = client_for(owner).post(LIST_URL, payload)
        assert response.status_code == 400


@pytest.mark.django_db
class TestReadAccess:
    def test_list_only_visible_destinations(
        self, client_for, members, destination, make_trip, make_destination
    ):
        foreign_trip = make_trip(owner=members["stranger"], title="Ailleurs")
        foreign = make_destination(trip=foreign_trip, city="Dakar", country_code="SN")

        viewer_ids = [d["id"] for d in client_for(members["viewer"]).get(LIST_URL).data["results"]]
        stranger_ids = [
            d["id"] for d in client_for(members["stranger"]).get(LIST_URL).data["results"]
        ]

        assert viewer_ids == [destination.pk]
        assert stranger_ids == [foreign.pk]

    def test_viewer_can_retrieve(self, client_for, members, destination):
        response = client_for(members["viewer"]).get(detail_url(destination))
        assert response.status_code == 200
        assert response.data["trip"] == destination.trip_id

    def test_stranger_gets_404(self, client_for, members, destination):
        assert client_for(members["stranger"]).get(detail_url(destination)).status_code == 404

    def test_filter_by_trip_and_ordering(
        self, client_for, owner, trip, make_trip, make_destination
    ):
        tokyo = make_destination(order=1, city="Tokyo")
        osaka = make_destination(
            order=2,
            city="Osaka",
            arrival_date=date(2027, 6, 8),
            departure_date=date(2027, 6, 10),
        )
        other_trip = make_trip(title="Autre")
        make_destination(trip=other_trip, order=1, city="Lisbonne", country_code="PT")
        client = client_for(owner)

        def cities(**params):
            response = client.get(LIST_URL, params)
            assert response.status_code == 200
            return [d["city"] for d in response.data["results"]]

        assert cities(trip=trip.pk) == [tokyo.city, osaka.city]
        assert cities(trip=trip.pk, ordering="-order") == ["Osaka", "Tokyo"]
        assert cities(trip=trip.pk, ordering="city") == ["Osaka", "Tokyo"]
        assert cities(search="lisb") == ["Lisbonne"]
        assert cities(country_code="PT") == ["Lisbonne"]
        assert cities(trip=999999) == []

    def test_non_numeric_trip_filter_is_rejected(self, client_for, owner):
        assert client_for(owner).get(LIST_URL, {"trip": "abc"}).status_code == 400


@pytest.mark.django_db
class TestUpdateAndDelete:
    def test_editor_can_update(self, client_for, members, destination):
        response = client_for(members["editor"]).patch(detail_url(destination), {"city": "Edo"})
        assert response.status_code == 200
        assert response.data["city"] == "Edo"

    def test_owner_can_replace(self, client_for, owner, destination, payload):
        response = client_for(owner).put(detail_url(destination), payload)
        assert response.status_code == 200
        destination.refresh_from_db()
        assert destination.city == "Kyoto"

    def test_viewer_gets_403(self, client_for, members, destination):
        response = client_for(members["viewer"]).patch(detail_url(destination), {"city": "Edo"})
        assert response.status_code == 403
        destination.refresh_from_db()
        assert destination.city == "Tokyo"

    @pytest.mark.parametrize("method", ["patch", "put", "delete"])
    def test_stranger_gets_404(self, client_for, members, destination, payload, method):
        response = getattr(client_for(members["stranger"]), method)(
            detail_url(destination), payload
        )
        assert response.status_code == 404
        assert Destination.objects.filter(pk=destination.pk, city="Tokyo").exists()

    def test_partial_update_is_checked_against_stored_dates(self, client_for, owner, destination):
        response = client_for(owner).patch(
            detail_url(destination), {"departure_date": "2027-07-01"}
        )
        assert response.status_code == 400
        assert "departure_date" in error_of(response)["details"]

    def test_cannot_strand_activities_outside_new_dates(
        self, client_for, owner, destination, make_activity
    ):
        make_activity(date=date(2027, 6, 6))
        response = client_for(owner).patch(
            detail_url(destination), {"departure_date": "2027-06-05"}
        )
        assert response.status_code == 400
        assert "non_field_errors" in error_of(response)["details"]

    def test_cannot_move_to_trip_where_user_is_viewer(
        self, client_for, members, destination, make_trip
    ):
        other = make_trip(owner=members["stranger"], title="Lecture seule")
        TripParticipant.objects.create(
            trip=other, user=members["editor"], role=TripParticipant.Role.VIEWER
        )
        response = client_for(members["editor"]).patch(detail_url(destination), {"trip": other.pk})
        assert response.status_code == 403
        destination.refresh_from_db()
        assert destination.trip_id != other.pk

    def test_editor_can_delete(self, client_for, members, destination):
        assert client_for(members["editor"]).delete(detail_url(destination)).status_code == 204
        assert not Destination.objects.exists()

    def test_viewer_cannot_delete(self, client_for, members, destination):
        assert client_for(members["viewer"]).delete(detail_url(destination)).status_code == 403
        assert Destination.objects.exists()
