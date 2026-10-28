"""Accès croisés entre deux utilisateurs, pour chaque ressource (OWASP API1 : BOLA).

Alice (user_a) a un voyage, une destination et une activité. Bob (user_b) ne participe
pas à ce voyage. Pour chaque point d'accès REST et chaque opération GraphQL qui touche
un objet d'Alice, on vérifie que Bob reçoit un 404 not_found s'il n'est pas participant
(l'objet « n'existe pas » pour lui). S'il est lecteur, il peut lire, mais une écriture
donne 403 permission_denied. Un client anonyme reçoit 401 not_authenticated. Quand la
requête est refusée, aucune ligne n'est créée, modifiée ou supprimée.
"""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.core.testing import error_of, graphql_codes
from apps.itinerary.models import Activity, Destination
from apps.trips.models import Trip, TripParticipant

Role = TripParticipant.Role


def snapshot():
    """Contenu des tables métier, pour vérifier qu'une requête refusée n'a rien changé."""
    return {
        model.__name__: list(model.objects.order_by("pk").values())
        for model in (get_user_model(), Trip, TripParticipant, Destination, Activity)
    }


@pytest.fixture
def objects_a(user_a, trip_a, destination_a, activity_a):
    return {"owner": user_a, "trip": trip_a, "destination": destination_a, "activity": activity_a}


@pytest.fixture
def b_as_viewer(trip_a, user_b):
    TripParticipant.objects.create(trip=trip_a, user=user_b, role=Role.VIEWER)


TRIP_PUT = {
    "title": "Piraté",
    "start_date": "2027-06-01",
    "end_date": "2027-06-20",
    "status": "planned",
}
DESTINATION_PUT = {
    "order": 1,
    "city": "Osaka",
    "country": "Japon",
    "country_code": "JP",
    "arrival_date": "2027-06-01",
    "departure_date": "2027-06-07",
}
ACTIVITY_PUT = {"name": "Piraté", "date": "2027-06-02", "category": "food", "cost": "1.00"}

# (méthode, route, objet d'Alice dans l'URL, corps, statut attendu pour Bob lecteur).
# None veut dire que le point d'accès appelle un service externe (testé ailleurs).
OBJECT_ENDPOINTS = [
    ("get", "trip-detail", "trip", None, 200),
    ("put", "trip-detail", "trip", TRIP_PUT, 403),
    ("patch", "trip-detail", "trip", {"title": "Piraté"}, 403),
    ("delete", "trip-detail", "trip", None, 403),
    ("get", "trip-stats", "trip", None, 200),
    ("post", "trip-clone", "trip", {"title": "Copie de Bob"}, 201),
    ("get", "trip-participants", "trip", None, 200),
    ("post", "trip-participants", "trip", {"email": "bob@example.com", "role": "editor"}, 403),
    ("patch", "trip-participant-detail", "participant", {"role": "viewer"}, 403),
    ("delete", "trip-participant-detail", "participant", None, 403),
    ("get", "destination-detail", "destination", None, 200),
    ("put", "destination-detail", "destination", DESTINATION_PUT, 403),
    ("patch", "destination-detail", "destination", {"city": "Osaka"}, 403),
    ("delete", "destination-detail", "destination", None, 403),
    ("get", "destination-weather", "destination", None, None),
    ("get", "destination-country", "destination", None, None),
    ("get", "destination-overview", "destination", None, None),
    ("get", "activity-detail", "activity", None, 200),
    ("put", "activity-detail", "activity", ACTIVITY_PUT, 403),
    ("patch", "activity-detail", "activity", {"cost": "0.00"}, 403),
    ("delete", "activity-detail", "activity", None, 403),
]
VIEWER_ENDPOINTS = [endpoint for endpoint in OBJECT_ENDPOINTS if endpoint[4] is not None]

# Points d'accès sans objet dans l'URL. Ils exigent tous un jeton.
COLLECTION_ENDPOINTS = [
    ("get", "trip-list"),
    ("post", "trip-list"),
    ("get", "destination-list"),
    ("post", "destination-list"),
    ("get", "activity-list"),
    ("post", "activity-list"),
    ("get", "auth:me"),
    ("post", "auth:logout"),
]


def endpoint_id(endpoint):
    return f"{endpoint[0].upper()} {endpoint[1]}"


def object_url(route, target, objects):
    if target == "participant":  # la participation d'Alice à son propre voyage
        return reverse(route, args=[objects["trip"].pk, objects["owner"].pk])
    return reverse(route, args=[objects[target].pk])


def send(client, method, url, body):
    return getattr(client, method)(url, body, format="json")


@pytest.mark.django_db
class TestRestStranger:
    @pytest.mark.parametrize("endpoint", OBJECT_ENDPOINTS, ids=endpoint_id)
    def test_gets_404_and_changes_nothing(self, client_b, objects_a, mock_http, endpoint):
        """Avec mock_http, un appel à Open-Meteo ou Countries ferait échouer le test."""
        method, route, target, body, _ = endpoint
        before = snapshot()

        response = send(client_b, method, object_url(route, target, objects_a), body)

        assert response.status_code == 404
        assert error_of(response)["code"] == "not_found"
        assert snapshot() == before

    @pytest.mark.parametrize(
        "route, target, params",
        [
            ("trip-list", "trip", lambda o: {}),
            ("trip-list", "trip", lambda o: {"search": "Alice"}),
            ("destination-list", "destination", lambda o: {}),
            ("destination-list", "destination", lambda o: {"trip": o["trip"].pk}),
            ("activity-list", "activity", lambda o: {}),
            ("activity-list", "activity", lambda o: {"trip": o["trip"].pk}),
            ("activity-list", "activity", lambda o: {"destination": o["destination"].pk}),
        ],
    )
    def test_lists_and_filters_never_show_objects_of_others(
        self, client_b, objects_a, activity_b, route, target, params
    ):
        """Sans filtre, Bob ne voit que ses objets ; filtrer sur ceux d'Alice ne donne rien."""
        filters = params(objects_a)
        own = {
            "trip": activity_b.destination.trip_id,
            "destination": activity_b.destination_id,
            "activity": activity_b.pk,
        }

        response = client_b.get(reverse(route), filters)

        assert response.status_code == 200
        ids = [item["id"] for item in response.data["results"]]
        assert ids == ([] if filters else [own[target]])

    def test_cannot_create_destination_in_trip_of_others(self, client_b, trip_a):
        before = snapshot()

        response = client_b.post(
            reverse("destination-list"), {**DESTINATION_PUT, "trip": trip_a.pk}
        )

        assert response.status_code == 404
        assert snapshot() == before

    def test_cannot_create_activity_in_destination_of_others(self, client_b, destination_a):
        before = snapshot()

        response = client_b.post(
            reverse("activity-list"), {**ACTIVITY_PUT, "destination": destination_a.pk}
        )

        assert response.status_code == 404
        assert snapshot() == before

    def test_cannot_move_own_destination_into_trip_of_others(self, client_b, destination_b, trip_a):
        before = snapshot()

        response = client_b.patch(
            reverse("destination-detail", args=[destination_b.pk]), {"trip": trip_a.pk}
        )

        assert response.status_code == 404
        assert snapshot() == before

    def test_cannot_move_own_activity_into_destination_of_others(
        self, client_b, activity_b, destination_a
    ):
        before = snapshot()

        response = client_b.patch(
            reverse("activity-detail", args=[activity_b.pk]), {"destination": destination_a.pk}
        )

        assert response.status_code == 404
        assert snapshot() == before


@pytest.mark.django_db
class TestRestViewer:
    @pytest.mark.parametrize("endpoint", VIEWER_ENDPOINTS, ids=endpoint_id)
    def test_reads_but_cannot_write(self, client_b, objects_a, b_as_viewer, endpoint):
        method, route, target, body, expected = endpoint
        before = snapshot()

        response = send(client_b, method, object_url(route, target, objects_a), body)

        assert response.status_code == expected
        if expected == 403:
            assert error_of(response)["code"] == "permission_denied"
            assert snapshot() == before


@pytest.mark.django_db
class TestRestAnonymous:
    @pytest.mark.parametrize("endpoint", OBJECT_ENDPOINTS, ids=endpoint_id)
    def test_object_endpoints_require_a_token(self, api_client, objects_a, mock_http, endpoint):
        method, route, target, body, _ = endpoint
        before = snapshot()

        response = send(api_client, method, object_url(route, target, objects_a), body)

        assert response.status_code == 401
        assert error_of(response)["code"] == "not_authenticated"
        assert response["WWW-Authenticate"].startswith("Bearer")
        assert snapshot() == before

    @pytest.mark.parametrize("method, route", COLLECTION_ENDPOINTS, ids=lambda value: value)
    def test_collection_endpoints_require_a_token(self, api_client, objects_a, method, route):
        before = snapshot()

        response = send(api_client, method, reverse(route), {"title": "Anonyme"})

        assert response.status_code == 401
        assert error_of(response)["code"] == "not_authenticated"
        assert snapshot() == before


@pytest.mark.django_db
class TestRestUnknownObjects:
    @pytest.mark.parametrize(
        "route",
        ["trip-detail", "trip-stats", "destination-detail", "activity-detail"],
    )
    @pytest.mark.parametrize("pk", [999999, "abc"])
    def test_unknown_or_malformed_id_gives_404(self, client_a, objects_a, route, pk):
        response = client_a.get(reverse(route, kwargs={"pk": pk}))

        assert response.status_code == 404
        assert error_of(response)["code"] == "not_found"

    def test_unknown_participant_gives_404(self, client_a, trip_a, user_b):
        url = reverse("trip-participant-detail", args=[trip_a.pk, user_b.pk])

        response = client_a.patch(url, {"role": "editor"})

        assert response.status_code == 404
        assert not TripParticipant.objects.filter(user=user_b).exists()


# Opérations GraphQL qui visent un objet d'Alice (requête, variables tirées des objets).
GRAPHQL_OPERATIONS = {
    "trip": (
        "query($id: ID!) { trip(id: $id) { id participants { user { username email } } } }",
        lambda o: {"id": o["trip"].pk},
    ),
    "destination": (
        "query($id: ID!) { destination(id: $id) { id city } }",
        lambda o: {"id": o["destination"].pk},
    ),
    "destinationOverview": (
        "query($id: ID!) { destinationOverview(id: $id) { totalCost } }",
        lambda o: {"id": o["destination"].pk},
    ),
    "updateTrip": (
        'mutation($id: ID!) { updateTrip(id: $id, input: {title: "Piraté"}) { trip { id } } }',
        lambda o: {"id": o["trip"].pk},
    ),
    "deleteTrip": (
        "mutation($id: ID!) { deleteTrip(id: $id) { ok } }",
        lambda o: {"id": o["trip"].pk},
    ),
    "cloneTrip": (
        "mutation($id: ID!) { cloneTrip(id: $id) { trip { id } } }",
        lambda o: {"id": o["trip"].pk},
    ),
    "addParticipant": (
        'mutation($id: ID!) { addParticipant(tripId: $id, email: "bob@example.com", '
        "role: EDITOR) { participant { role } } }",
        lambda o: {"id": o["trip"].pk},
    ),
    "removeParticipant": (
        "mutation($trip: ID!, $user: ID!) { removeParticipant(tripId: $trip, userId: $user) "
        "{ ok } }",
        lambda o: {"trip": o["trip"].pk, "user": o["owner"].pk},
    ),
    "createDestination": (
        'mutation($trip: ID!) { createDestination(input: {trip: $trip, order: 9, city: "Osaka", '
        'country: "Japon", countryCode: "JP", arrivalDate: "2027-06-08", '
        'departureDate: "2027-06-10"}) { destination { id } } }',
        lambda o: {"trip": o["trip"].pk},
    ),
    "updateDestination": (
        'mutation($id: ID!) { updateDestination(id: $id, input: {city: "Osaka"}) '
        "{ destination { id } } }",
        lambda o: {"id": o["destination"].pk},
    ),
    "deleteDestination": (
        "mutation($id: ID!) { deleteDestination(id: $id) { ok } }",
        lambda o: {"id": o["destination"].pk},
    ),
    "createActivity": (
        "mutation($destination: ID!) { createActivity(input: {destination: $destination, "
        'name: "Piraté", date: "2027-06-02"}) { activity { id } } }',
        lambda o: {"destination": o["destination"].pk},
    ),
    "updateActivity": (
        'mutation($id: ID!) { updateActivity(id: $id, input: {name: "Piraté"}) '
        "{ activity { id } } }",
        lambda o: {"id": o["activity"].pk},
    ),
    "deleteActivity": (
        "mutation($id: ID!) { deleteActivity(id: $id) { ok } }",
        lambda o: {"id": o["activity"].pk},
    ),
}

# Bob lecteur peut lire et cloner, mais les autres mutations sont refusées.
VIEWER_ALLOWED = {"trip", "destination", "destinationOverview", "cloneTrip"}


@pytest.mark.django_db
class TestGraphqlCrossAccess:
    @pytest.mark.parametrize("field", GRAPHQL_OPERATIONS)
    def test_stranger_gets_not_found_and_changes_nothing(
        self, graphql, user_b, objects_a, mock_http, field
    ):
        query, variables = GRAPHQL_OPERATIONS[field]
        before = snapshot()

        response = graphql(query, variables=variables(objects_a), user=user_b)

        assert response.status_code == 200
        assert response.json()["data"] == {field: None}
        assert graphql_codes(response) == ["not_found"]
        assert snapshot() == before

    @pytest.mark.parametrize("field", sorted(set(GRAPHQL_OPERATIONS) - VIEWER_ALLOWED))
    def test_viewer_cannot_write(self, graphql, user_b, objects_a, b_as_viewer, field):
        query, variables = GRAPHQL_OPERATIONS[field]
        before = snapshot()

        response = graphql(query, variables=variables(objects_a), user=user_b)

        assert response.json()["data"] == {field: None}
        assert graphql_codes(response) == ["permission_denied"]
        assert snapshot() == before

    @pytest.mark.parametrize("field", GRAPHQL_OPERATIONS)
    def test_anonymous_gets_not_authenticated(self, graphql, objects_a, mock_http, field):
        query, variables = GRAPHQL_OPERATIONS[field]
        before = snapshot()

        response = graphql(query, variables=variables(objects_a))

        assert response.json()["data"] == {field: None}
        assert graphql_codes(response) == ["not_authenticated"]
        assert snapshot() == before

    def test_my_trips_never_lists_trips_of_others(self, graphql, user_b, trip_a, trip_b):
        response = graphql("query { myTrips { title } myTripsCount }", user=user_b)

        assert response.json()["data"] == {
            "myTrips": [{"title": "Voyage de Bob"}],
            "myTripsCount": 1,
        }

    def test_viewer_does_not_see_email_of_other_participants(
        self, graphql, user_b, objects_a, b_as_viewer
    ):
        query, variables = GRAPHQL_OPERATIONS["trip"]

        response = graphql(query, variables=variables(objects_a), user=user_b)

        participants = response.json()["data"]["trip"]["participants"]
        emails = {p["user"]["username"]: p["user"]["email"] for p in participants}
        assert emails == {"alice": None, "bob": "bob@example.com"}
