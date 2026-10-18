from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.trips.models import Trip, TripParticipant

Role = TripParticipant.Role

LIST_URL = reverse("trip-list")


def detail_url(trip):
    return reverse("trip-detail", args=[trip.pk])


PAYLOAD = {
    "title": "Road trip en Gaspésie",
    "description": "Percé et le parc Forillon.",
    "start_date": "2027-07-01",
    "end_date": "2027-07-10",
    "status": "planned",
    "budget": "1800.00",
}


@pytest.mark.django_db
class TestAuthenticationRequired:
    def test_list_requires_authentication(self, api_client):
        assert api_client.get(LIST_URL).status_code == 401

    def test_detail_requires_authentication(self, api_client, trip):
        assert api_client.get(detail_url(trip)).status_code == 401


@pytest.mark.django_db
class TestCreate:
    def test_creates_trip_owned_by_current_user(self, client_for, owner, make_user):
        intruder = make_user("intruder")

        response = client_for(owner).post(LIST_URL, {**PAYLOAD, "owner": intruder.pk})

        assert response.status_code == 201
        trip = Trip.objects.get(pk=response.data["id"])
        # owner est en lecture seule : la valeur envoyée est ignorée.
        assert trip.owner == owner
        assert response.data["owner"]["username"] == "owner"
        assert trip.memberships.get().role == Role.OWNER
        assert response.data["destination_count"] == 0
        assert response.data["total_cost"] == "0.00"

    def test_rejects_end_before_start(self, client_for, owner):
        response = client_for(owner).post(
            LIST_URL, {**PAYLOAD, "start_date": "2027-07-10", "end_date": "2027-07-01"}
        )
        assert response.status_code == 400
        assert "end_date" in response.data["error"]["details"]
        assert not Trip.objects.exists()

    @pytest.mark.parametrize(
        ("field", "value"),
        [("budget", "-1"), ("status", "inconnu"), ("title", ""), ("start_date", "demain")],
    )
    def test_rejects_invalid_field(self, client_for, owner, field, value):
        response = client_for(owner).post(LIST_URL, {**PAYLOAD, field: value})
        assert response.status_code == 400
        assert field in response.data["error"]["details"]


@pytest.mark.django_db
class TestListAndRetrieve:
    def test_lists_only_visible_trips(self, client_for, trip, members, make_trip):
        foreign = make_trip(owner=members["stranger"], title="Voyage d'un autre")

        for user in (members["viewer"], members["editor"]):
            ids = [item["id"] for item in client_for(user).get(LIST_URL).data["results"]]
            assert ids == [trip.pk]
        stranger_ids = [
            r["id"] for r in client_for(members["stranger"]).get(LIST_URL).data["results"]
        ]
        assert stranger_ids == [foreign.pk]

    def test_list_contains_annotated_totals(
        self, client_for, owner, trip, make_destination, make_activity
    ):
        kyoto = make_destination(
            city="Kyoto", arrival_date=date(2027, 6, 8), departure_date=date(2027, 6, 12)
        )
        make_activity(cost=Decimal("25.50"))
        make_activity(destination=kyoto, date=date(2027, 6, 9), cost=Decimal("100.00"))

        item = client_for(owner).get(LIST_URL).data["results"][0]

        assert item["destination_count"] == 2
        assert item["activity_count"] == 2
        assert item["total_cost"] == "125.50"

    def test_detail_nests_destinations_and_activities(
        self, client_for, members, trip, destination, make_activity
    ):
        make_activity(name="Shibuya")

        response = client_for(members["viewer"]).get(detail_url(trip))

        assert response.status_code == 200
        [nested] = response.data["destinations"]
        assert nested["city"] == "Tokyo"
        assert [a["name"] for a in nested["activities"]] == ["Shibuya"]
        assert response.data["activity_count"] == 1

    def test_list_query_count_does_not_grow_with_trips(
        self, client_for, owner, make_trip, django_assert_max_num_queries
    ):
        for i in range(5):
            make_trip(title=f"Voyage {i}")
        # Authentification forcée : 1 requête de comptage (pagination) + 1 requête de page.
        with django_assert_max_num_queries(2):
            response = client_for(owner).get(LIST_URL)
        assert response.data["count"] == 5

    def test_detail_query_count_is_bounded(
        self,
        client_for,
        owner,
        trip,
        make_destination,
        make_activity,
        django_assert_max_num_queries,
    ):
        for order in range(1, 4):
            dest = make_destination(order=order + 10)
            make_activity(destination=dest)
        # Voyage, destinations, activités ; IsTripMember ne requête pas pour le propriétaire.
        with django_assert_max_num_queries(3):
            assert client_for(owner).get(detail_url(trip)).status_code == 200


@pytest.mark.django_db
class TestIsolationBetweenUsers:
    """Critère de fin d'étape : B reçoit 404 sur le voyage de A."""

    @pytest.mark.parametrize("method", ["get", "put", "patch", "delete"])
    def test_stranger_gets_404(self, client_for, trip, members, method):
        response = getattr(client_for(members["stranger"]), method)(detail_url(trip), PAYLOAD)
        assert response.status_code == 404
        trip.refresh_from_db()
        assert trip.title == "Voyage au Japon"

    def test_end_to_end_with_real_jwt(self, api_client, make_user):
        make_user("alice")
        make_user("bob")

        def login(username):
            response = api_client.post(
                reverse("auth:token"), {"username": username, "password": "pw-Secret-123"}
            )
            api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

        login("alice")
        created = api_client.post(LIST_URL, PAYLOAD)
        assert created.status_code == 201
        trip_url = reverse("trip-detail", args=[created.data["id"]])
        assert api_client.get(LIST_URL).data["count"] == 1
        assert api_client.patch(trip_url, {"status": "ongoing"}).data["status"] == "ongoing"

        login("bob")
        assert api_client.get(LIST_URL).data["count"] == 0
        assert api_client.get(trip_url).status_code == 404
        assert api_client.delete(trip_url).status_code == 404

        login("alice")
        assert api_client.delete(trip_url).status_code == 204
        assert not Trip.objects.exists()


@pytest.mark.django_db
class TestRolePermissions:
    def test_viewer_can_read_but_not_write(self, client_for, trip, members):
        viewer = client_for(members["viewer"])
        assert viewer.get(detail_url(trip)).status_code == 200
        assert viewer.patch(detail_url(trip), {"title": "Piraté"}).status_code == 403
        assert viewer.put(detail_url(trip), PAYLOAD).status_code == 403
        assert viewer.delete(detail_url(trip)).status_code == 403
        trip.refresh_from_db()
        assert trip.title == "Voyage au Japon"

    def test_editor_can_update_but_not_delete(self, client_for, trip, members):
        editor = client_for(members["editor"])

        response = editor.patch(detail_url(trip), {"title": "Japon 2027"})

        assert response.status_code == 200
        assert response.data["title"] == "Japon 2027"
        assert response.data["owner"]["username"] == "owner"
        assert editor.delete(detail_url(trip)).status_code == 403
        assert Trip.objects.filter(pk=trip.pk).exists()

    def test_owner_can_replace_and_delete(self, client_for, owner, trip):
        client = client_for(owner)

        replaced = client.put(detail_url(trip), PAYLOAD)
        assert replaced.status_code == 200
        assert replaced.data["title"] == PAYLOAD["title"]
        assert "total_cost" in replaced.data

        assert client.delete(detail_url(trip)).status_code == 204
        assert not Trip.objects.filter(pk=trip.pk).exists()


@pytest.mark.django_db
class TestUpdateValidation:
    def test_partial_update_checks_dates_against_stored_value(self, client_for, owner, trip):
        # Seule end_date est envoyée : elle est comparée au start_date existant (2027-06-01).
        response = client_for(owner).patch(detail_url(trip), {"end_date": "2027-05-01"})
        assert response.status_code == 400
        assert "end_date" in response.data["error"]["details"]

    def test_cannot_shrink_trip_below_its_destinations(self, client_for, owner, trip, destination):
        # La destination de Tokyo va du 1er au 7 juin.
        response = client_for(owner).patch(detail_url(trip), {"end_date": "2027-06-05"})
        assert response.status_code == 400
        assert "non_field_errors" in response.data["error"]["details"]
        trip.refresh_from_db()
        assert trip.end_date == date(2027, 6, 20)


@pytest.mark.django_db
class TestFilteringOrderingPagination:
    @pytest.fixture
    def trips(self, make_trip):
        return {
            "japon": make_trip(
                title="Japon",
                status=Trip.Status.PLANNED,
                start_date=date(2027, 4, 1),
                end_date=date(2027, 4, 15),
            ),
            "paris": make_trip(
                title="Paris",
                description="Musées et cafés",
                status=Trip.Status.DRAFT,
                start_date=date(2027, 2, 1),
                end_date=date(2027, 2, 5),
            ),
            "dakar": make_trip(
                title="Dakar",
                status=Trip.Status.PLANNED,
                start_date=date(2027, 9, 1),
                end_date=date(2027, 9, 20),
            ),
        }

    def titles(self, client, **params):
        response = client.get(LIST_URL, params)
        assert response.status_code == 200
        return [item["title"] for item in response.data["results"]]

    def test_default_order_is_start_date(self, client_for, owner, trips):
        assert self.titles(client_for(owner)) == ["Paris", "Japon", "Dakar"]

    @pytest.mark.parametrize(
        ("params", "expected"),
        [
            ({"status": "planned"}, ["Japon", "Dakar"]),
            ({"start_date__gte": "2027-04-01"}, ["Japon", "Dakar"]),
            ({"end_date__lte": "2027-04-15"}, ["Paris", "Japon"]),
            ({"title__icontains": "JAP"}, ["Japon"]),
            ({"search": "musées"}, ["Paris"]),
            ({"ordering": "title"}, ["Dakar", "Japon", "Paris"]),
            ({"ordering": "-start_date"}, ["Dakar", "Japon", "Paris"]),
            ({"status": "planned", "ordering": "-title"}, ["Japon", "Dakar"]),
        ],
    )
    def test_filters_search_and_ordering(self, client_for, owner, trips, params, expected):
        assert self.titles(client_for(owner), **params) == expected

    def test_unknown_ordering_field_is_ignored(self, client_for, owner, trips):
        assert self.titles(client_for(owner), ordering="owner__password") == [
            "Paris",
            "Japon",
            "Dakar",
        ]

    def test_invalid_status_filter_is_rejected(self, client_for, owner, trips):
        assert client_for(owner).get(LIST_URL, {"status": "inconnu"}).status_code == 400

    def test_paginates_by_20(self, client_for, owner, make_trip):
        for i in range(21):
            make_trip(title=f"Voyage {i:02}")

        first = client_for(owner).get(LIST_URL).data
        second = client_for(owner).get(first["next"]).data

        assert first["count"] == 21
        assert len(first["results"]) == 20
        assert len(second["results"]) == 1
        assert second["next"] is None
