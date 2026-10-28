"""Validation des entrées. Une donnée invalide doit donner un 400 lisible et ne rien écrire.

On teste les dates incohérentes ou hors du voyage, les montants négatifs, les longueurs,
les choix inconnus, les formats invalides, les paramètres de requête et les corps mal
formés.
"""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.core.testing import error_of
from apps.itinerary.models import Activity, Destination
from apps.trips.models import Trip, TripParticipant

# trip_a va du 2027-06-01 au 2027-06-20, destination_a du 2027-06-01 au 2027-06-07.
TRIP = {"title": "Voyage", "start_date": "2027-06-01", "end_date": "2027-06-10"}
DESTINATION = {
    "order": 5,
    "city": "Kyoto",
    "country": "Japon",
    "country_code": "JP",
    "arrival_date": "2027-06-08",
    "departure_date": "2027-06-12",
}
ACTIVITY = {"name": "Musée", "date": "2027-06-03", "category": "culture", "cost": "10.00"}


def row_counts():
    return {
        model.__name__: model.objects.count()
        for model in (get_user_model(), Trip, TripParticipant, Destination, Activity)
    }


def assert_rejected(response, field, before):
    assert response.status_code == 400, response.content
    error = error_of(response)
    assert error["code"] == "validation_error"
    assert field in error["details"], error
    assert row_counts() == before


@pytest.mark.django_db
class TestTrips:
    @pytest.mark.parametrize(
        "changes, field",
        [
            ({"start_date": "2027-06-10", "end_date": "2027-06-01"}, "end_date"),
            ({"start_date": "2027-13-45"}, "start_date"),
            ({"end_date": "demain"}, "end_date"),
            ({"budget": "-1.00"}, "budget"),
            ({"budget": "beaucoup"}, "budget"),
            ({"budget": "123456789.00"}, "budget"),
            ({"title": ""}, "title"),
            ({"title": "x" * 201}, "title"),
            ({"status": "archived"}, "status"),
        ],
        ids=lambda value: str(value)[:40],
    )
    def test_invalid_trip_is_rejected(self, client_a, changes, field):
        before = row_counts()
        response = client_a.post(reverse("trip-list"), {**TRIP, **changes}, format="json")
        assert_rejected(response, field, before)

    @pytest.mark.parametrize("missing", ["title", "start_date", "end_date"])
    def test_required_fields(self, client_a, missing):
        before = row_counts()
        payload = {key: value for key, value in TRIP.items() if key != missing}
        response = client_a.post(reverse("trip-list"), payload, format="json")
        assert_rejected(response, missing, before)

    def test_partial_update_checks_dates_against_stored_value(self, client_a, trip_a):
        url = reverse("trip-detail", args=[trip_a.pk])
        before = row_counts()

        response = client_a.patch(url, {"end_date": "2027-05-01"}, format="json")

        assert_rejected(response, "end_date", before)
        trip_a.refresh_from_db()
        assert str(trip_a.end_date) == "2027-06-20"

    def test_shortening_trip_cannot_strand_destinations(self, client_a, destination_a):
        url = reverse("trip-detail", args=[destination_a.trip_id])
        before = row_counts()

        response = client_a.patch(url, {"start_date": "2027-06-05"}, format="json")

        assert_rejected(response, "non_field_errors", before)


@pytest.mark.django_db
class TestDestinations:
    @pytest.mark.parametrize(
        "changes, field",
        [
            ({"arrival_date": "2027-05-30"}, "arrival_date"),
            ({"departure_date": "2027-06-21"}, "departure_date"),
            ({"arrival_date": "2027-06-12", "departure_date": "2027-06-08"}, "non_field_errors"),
            ({"country_code": "JPN"}, "country_code"),
            ({"country_code": "1A"}, "country_code"),
            ({"order": -1}, "order"),
            ({"order": 1}, "non_field_errors"),  # position déjà occupée par destination_a
            ({"latitude": "91.0", "longitude": "10.0"}, "latitude"),
            ({"latitude": "45.0"}, "non_field_errors"),  # longitude manquante
            ({"city": ""}, "city"),
        ],
        ids=lambda value: str(value)[:40],
    )
    def test_invalid_destination_is_rejected(self, client_a, destination_a, changes, field):
        payload = {**DESTINATION, "trip": destination_a.trip_id, **changes}
        before = row_counts()
        response = client_a.post(reverse("destination-list"), payload, format="json")
        assert_rejected(response, field, before)

    def test_trip_must_be_an_identifier(self, client_a, destination_a):
        before = row_counts()
        payload = {**DESTINATION, "trip": "pas-un-id"}
        response = client_a.post(reverse("destination-list"), payload, format="json")
        assert_rejected(response, "trip", before)


@pytest.mark.django_db
class TestActivities:
    @pytest.mark.parametrize(
        "changes, field",
        [
            ({"date": "2027-06-08"}, "date"),  # après le départ de la destination
            ({"date": "2027-05-31"}, "date"),
            ({"cost": "-5.00"}, "cost"),
            ({"cost": "1.234"}, "cost"),
            ({"category": "fête"}, "category"),
            ({"start_time": "25:00"}, "start_time"),
            ({"name": "x" * 201}, "name"),
        ],
        ids=lambda value: str(value)[:40],
    )
    def test_invalid_activity_is_rejected(self, client_a, destination_a, changes, field):
        payload = {**ACTIVITY, "destination": destination_a.pk, **changes}
        before = row_counts()
        response = client_a.post(reverse("activity-list"), payload, format="json")
        assert_rejected(response, field, before)


@pytest.mark.django_db
class TestParticipantsAndAccounts:
    @pytest.mark.parametrize(
        "payload, field",
        [
            ({"email": "pas-un-courriel"}, "email"),
            ({"email": "inconnu@example.com"}, "email"),
            ({"email": "bob@example.com", "role": "admin"}, "role"),
            ({"email": "alice@example.com"}, "email"),  # le propriétaire lui-même
        ],
        ids=lambda value: str(value)[:40],
    )
    def test_invalid_invitation_is_rejected(self, client_a, trip_a, user_b, payload, field):
        before = row_counts()
        url = reverse("trip-participants", args=[trip_a.pk])
        response = client_a.post(url, payload, format="json")
        assert_rejected(response, field, before)

    @pytest.mark.parametrize(
        "changes, field",
        [
            ({"password": "123"}, "password"),
            ({"password": "motdepasse"}, "password"),
            ({"password": "carol2027"}, "password"),  # trop proche du nom d'utilisateur
            ({"email": "carol"}, "email"),
            ({"email": "ALICE@example.com"}, "email"),  # déjà pris, casse ignorée
            ({"username": "carol dupont"}, "username"),
            ({"username": "alice"}, "username"),
        ],
        ids=lambda value: str(value)[:40],
    )
    def test_invalid_registration_is_rejected(self, api_client, user_a, changes, field):
        payload = {
            "username": "carol",
            "email": "carol@example.com",
            "password": "Voyage-Montreal-2027",
            **changes,
        }
        before = row_counts()
        response = api_client.post(reverse("auth:register"), payload, format="json")
        assert_rejected(response, field, before)


@pytest.mark.django_db
class TestRequests:
    @pytest.mark.parametrize(
        "route, params",
        [
            ("trip-list", {"start_date__gte": "pas-une-date"}),
            ("trip-list", {"status": "archived"}),
            ("destination-list", {"trip": "abc"}),
            ("activity-list", {"category": "fête"}),
        ],
        ids=lambda value: str(value),
    )
    def test_invalid_filter_gives_400(self, client_a, route, params):
        response = client_a.get(reverse(route), params)

        assert response.status_code == 400
        assert error_of(response)["code"] == "validation_error"

    def test_unknown_ordering_field_is_ignored(self, client_a, trip_a):
        response = client_a.get(reverse("trip-list"), {"ordering": "owner__password"})

        assert response.status_code == 200
        assert [trip["id"] for trip in response.data["results"]] == [trip_a.pk]

    @pytest.mark.parametrize("page", ["999", "abc", "0"])
    def test_invalid_page_gives_404(self, client_a, trip_a, page):
        response = client_a.get(reverse("trip-list"), {"page": page})

        assert response.status_code == 404
        assert error_of(response)["code"] == "not_found"

    def test_malformed_json_gives_400(self, client_a):
        response = client_a.post(
            reverse("trip-list"), '{"title": "Voyage",', content_type="application/json"
        )

        assert response.status_code == 400
        assert error_of(response)["code"] == "parse_error"
        assert not Trip.objects.exists()

    def test_unsupported_media_type_gives_415(self, client_a):
        response = client_a.post(reverse("trip-list"), "title=Voyage", content_type="text/plain")

        assert response.status_code == 415
        assert error_of(response)["code"] == "unsupported_media_type"

    def test_unknown_url_gives_json_404(self, client_a):
        response = client_a.get("/api/inconnu/")

        assert response.status_code == 404
        assert response["Content-Type"] == "application/json"
        assert error_of(response)["code"] == "not_found"


@pytest.mark.django_db
class TestGraphql:
    def test_mutation_errors_use_camel_case_fields(self, graphql, user_a, trip_a):
        query = (
            'mutation($id: ID!) { updateTrip(id: $id, input: {endDate: "2027-05-01"}) '
            "{ trip { id } } }"
        )

        response = graphql(query, variables={"id": trip_a.pk}, user=user_a)

        [error] = response.json()["errors"]
        assert error["extensions"]["code"] == "validation_error"
        assert "endDate" in error["extensions"]["details"]

    @pytest.mark.parametrize(
        "value", ['"2027-13-45"', '"demain"', "20270601"], ids=["mois", "texte", "nombre"]
    )
    def test_malformed_date_is_rejected_before_execution(self, graphql, user_a, value):
        query = (
            f'mutation {{ createTrip(input: {{title: "V", startDate: {value}, '
            'endDate: "2027-06-02"}) { trip { id } } }'
        )

        response = graphql(query, user=user_a)

        assert response.status_code == 400
        assert not Trip.objects.exists()

    @pytest.mark.parametrize("limit, offset", [(0, 0), (101, 0), (10, -1)])
    def test_pagination_bounds(self, graphql, user_a, limit, offset):
        response = graphql(
            "query($limit: Int, $offset: Int) { myTrips(limit: $limit, offset: $offset) { id } }",
            variables={"limit": limit, "offset": offset},
            user=user_a,
        )

        [error] = response.json()["errors"]
        assert error["extensions"]["code"] == "validation_error"
