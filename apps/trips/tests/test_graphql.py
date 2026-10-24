"""API GraphQL des voyages : requêtes myTrips et trip, mutations des voyages et participants."""

from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.core.testing import graphql_codes, graphql_data
from apps.itinerary.models import Activity, Destination
from apps.trips.models import Trip, TripParticipant
from apps.trips.services import LAST_OWNER_MESSAGE

Role = TripParticipant.Role

MY_TRIPS = """
query MyTrips($status: TripStatus, $startAfter: Date, $search: String, $orderBy: TripOrderBy) {
  myTrips(status: $status, startAfter: $startAfter, search: $search, orderBy: $orderBy) {
    title
  }
}
"""

TRIP_DETAIL = """
query Trip($id: ID!) {
  trip(id: $id) {
    id
    title
    status
    budget
    owner { username email }
    destinationCount
    activityCount
    totalCost
    destinations { city activities { name cost category } }
    participants { role user { username email } invitedBy { username } }
  }
}
"""

CREATE_TRIP = """
mutation Create($input: TripCreateInput!) {
  createTrip(input: $input) {
    trip { id title status budget owner { username } participants { role user { username } } }
  }
}
"""

UPDATE_TRIP = """
mutation Update($id: ID!, $input: TripUpdateInput!) {
  updateTrip(id: $id, input: $input) { trip { title status budget endDate } }
}
"""

DELETE_TRIP = "mutation Delete($id: ID!) { deleteTrip(id: $id) { ok id } }"

CLONE_TRIP = """
mutation Clone($id: ID!, $title: String) {
  cloneTrip(id: $id, title: $title) {
    trip { id title status owner { username } destinationCount activityCount totalCost }
  }
}
"""

ADD_PARTICIPANT = """
mutation Add($tripId: ID!, $email: String!, $role: InvitableRole) {
  addParticipant(tripId: $tripId, email: $email, role: $role) {
    participant { role user { username } invitedBy { username } }
  }
}
"""

REMOVE_PARTICIPANT = """
mutation Remove($tripId: ID!, $userId: ID!) {
  removeParticipant(tripId: $tripId, userId: $userId) {
    ok
    trip { participants { user { username } } }
  }
}
"""


def only_error(response):
    """Unique erreur d'une réponse GraphQL."""
    errors = response.json()["errors"]
    assert len(errors) == 1, errors
    return errors[0]


@pytest.mark.django_db
class TestMyTrips:
    def test_lists_only_visible_trips(self, graphql, members, trip, make_trip):
        make_trip(owner=members["stranger"], title="Voyage d'un autre")

        for user in (trip.owner, members["viewer"]):
            data = graphql_data(graphql(MY_TRIPS, user=user))
            assert data == {"myTrips": [{"title": "Voyage au Japon"}]}
        stranger_trips = graphql_data(graphql(MY_TRIPS, user=members["stranger"]))["myTrips"]
        assert stranger_trips == [{"title": "Voyage d'un autre"}]

    def test_anonymous_gets_not_authenticated(self, graphql, trip):
        response = graphql(MY_TRIPS)

        assert response.json()["data"] is None  # myTrips est non nullable
        assert graphql_codes(response) == ["not_authenticated"]

    @pytest.mark.parametrize(
        ("variables", "expected"),
        [
            ({}, ["Islande", "Japon", "Pérou"]),
            ({"status": "PLANNED"}, ["Japon", "Pérou"]),
            ({"startAfter": "2027-06-01"}, ["Japon", "Pérou"]),
            ({"search": "cuzco"}, ["Pérou"]),
            ({"search": "PÉROU andes"}, ["Pérou"]),
            ({"search": "pérou islande"}, []),  # chaque mot doit figurer
            ({"orderBy": "TITLE_DESC"}, ["Pérou", "Japon", "Islande"]),
            ({"orderBy": "START_DATE_DESC", "status": "PLANNED"}, ["Pérou", "Japon"]),
        ],
    )
    def test_filters_and_ordering(self, graphql, owner, make_trip, variables, expected):
        make_trip(title="Japon", start_date=date(2027, 6, 1), status=Trip.Status.PLANNED)
        make_trip(
            title="Pérou",
            description="Les Andes, de Lima à Cuzco.",
            start_date=date(2027, 8, 1),
            end_date=date(2027, 8, 20),
            status=Trip.Status.PLANNED,
        )
        make_trip(title="Islande", start_date=date(2027, 3, 1), end_date=date(2027, 3, 10))

        data = graphql_data(graphql(MY_TRIPS, variables=variables, user=owner))

        assert [trip["title"] for trip in data["myTrips"]] == expected

    def test_pagination_with_total(self, graphql, owner, make_trip):
        for month in range(1, 6):
            make_trip(
                title=f"Voyage {month}",
                start_date=date(2027, month, 1),
                end_date=date(2027, month, 5),
            )
        query = """
        query Page($limit: Int, $offset: Int) {
          myTrips(limit: $limit, offset: $offset) { title }
          myTripsCount
        }
        """

        data = graphql_data(graphql(query, variables={"limit": 2, "offset": 2}, user=owner))

        assert [trip["title"] for trip in data["myTrips"]] == ["Voyage 3", "Voyage 4"]
        assert data["myTripsCount"] == 5

    def test_default_page_size_is_twenty(self, graphql, owner, make_trip):
        for day in range(1, 23):
            make_trip(
                title=f"Voyage {day}", start_date=date(2027, 1, day), end_date=date(2027, 1, 28)
            )

        data = graphql_data(graphql("query { myTrips { title } myTripsCount }", user=owner))

        assert (len(data["myTrips"]), data["myTripsCount"]) == (20, 22)

    def test_count_uses_the_same_filters(self, graphql, owner, members, make_trip):
        make_trip(title="Pérou", status=Trip.Status.PLANNED)
        make_trip(owner=members["stranger"], status=Trip.Status.PLANNED)
        query = "query { myTripsCount(status: PLANNED) all: myTripsCount }"

        data = graphql_data(graphql(query, user=owner))

        assert data == {"myTripsCount": 1, "all": 2}

    @pytest.mark.parametrize(
        ("variables", "field"),
        [({"limit": 0}, "limit"), ({"limit": 101}, "limit"), ({"offset": -1}, "offset")],
    )
    def test_invalid_page(self, graphql, owner, variables, field):
        query = (
            "query ($limit: Int, $offset: Int) { myTrips(limit: $limit, offset: $offset) { id } }"
        )

        error = only_error(graphql(query, variables=variables, user=owner))

        assert error["extensions"]["code"] == "validation_error"
        assert list(error["extensions"]["details"]) == [field]

    def test_invalid_enum_value_gives_400(self, graphql, owner):
        response = graphql(MY_TRIPS, variables={"status": "UNKNOWN"}, user=owner)

        assert response.status_code == 400

    def test_query_count_does_not_grow_with_trips(
        self, graphql, owner, make_trip, make_destination, make_activity
    ):
        """Pas de N+1 : relations préchargées d'après les champs demandés."""
        query = """
        query { myTrips {
          title totalCost owner { username }
          destinations { city activities { name } }
          participants { role user { username } }
        } }
        """

        def count_queries():
            with CaptureQueriesContext(connection) as queries:
                graphql_data(graphql(query, user=owner))
            return len(queries)

        def add_trip(title):
            trip = make_trip(title=title)
            destination = make_destination(trip=trip)
            make_activity(destination=destination)

        add_trip("Premier")
        with_one_trip = count_queries()
        add_trip("Deuxième")
        add_trip("Troisième")

        assert count_queries() == with_one_trip


@pytest.mark.django_db
class TestTrip:
    def test_viewer_gets_details(self, graphql, members, trip, destination, make_activity):
        trip.budget = Decimal("1500.00")
        trip.save()
        make_activity(name="Senso-ji", cost=Decimal("12.50"))
        make_activity(name="Sushi", cost=Decimal("30.00"), category="food")

        response = graphql(TRIP_DETAIL, variables={"id": trip.pk}, user=members["viewer"])

        data = graphql_data(response)["trip"]
        assert data["id"] == str(trip.pk)
        assert data["status"] == "DRAFT"
        assert data["budget"] == "1500.00"
        assert data["owner"] == {"username": "owner", "email": None}  # courriel d'autrui masqué
        assert (data["destinationCount"], data["activityCount"]) == (1, 2)
        assert data["totalCost"] == "42.50"
        assert data["destinations"] == [
            {
                "city": "Tokyo",
                "activities": [
                    {"name": "Senso-ji", "cost": "12.50", "category": "SIGHTSEEING"},
                    {"name": "Sushi", "cost": "30.00", "category": "FOOD"},
                ],
            }
        ]
        roles = {p["user"]["username"]: p["role"] for p in data["participants"]}
        assert roles == {"owner": "OWNER", "editor": "EDITOR", "viewer": "VIEWER"}
        viewer = next(p for p in data["participants"] if p["user"]["username"] == "viewer")
        assert viewer["user"]["email"] == "viewer@example.com"  # son propre courriel

    @pytest.mark.parametrize("trip_id", ["stranger_trip", "999999", "abc"])
    def test_invisible_or_unknown_trip_gives_not_found(self, graphql, members, trip, trip_id):
        trip_id = trip.pk if trip_id == "stranger_trip" else trip_id

        response = graphql(TRIP_DETAIL, variables={"id": trip_id}, user=members["stranger"])

        assert response.status_code == 200
        assert response.json()["data"] == {"trip": None}
        error = only_error(response)
        assert error["extensions"] == {"code": "not_found", "details": {}}
        assert error["message"] == "Voyage introuvable."
        assert error["path"] == ["trip"]

    def test_anonymous_gets_not_authenticated(self, graphql, trip):
        response = graphql(TRIP_DETAIL, variables={"id": trip.pk})

        assert graphql_codes(response) == ["not_authenticated"]

    def test_error_only_nulls_its_own_field(self, graphql, members, trip):
        query = "query ($id: ID!) { me { username } trip(id: $id) { title } }"

        response = graphql(query, variables={"id": trip.pk}, user=members["stranger"])

        assert response.json()["data"] == {"me": {"username": "stranger"}, "trip": None}
        assert graphql_codes(response) == ["not_found"]


TRIP_INPUT = {
    "title": "Road trip en Gaspésie",
    "startDate": "2027-07-01",
    "endDate": "2027-07-10",
    "budget": "2500.00",
}


@pytest.mark.django_db
class TestCreateTrip:
    def test_creates_trip_owned_by_user(self, graphql, owner):
        response = graphql(CREATE_TRIP, variables={"input": TRIP_INPUT}, user=owner)

        trip = graphql_data(response)["createTrip"]["trip"]
        assert trip["title"] == "Road trip en Gaspésie"
        assert trip["status"] == "DRAFT"
        assert trip["budget"] == "2500.00"
        assert trip["owner"] == {"username": "owner"}
        assert trip["participants"] == [{"role": "OWNER", "user": {"username": "owner"}}]
        assert Trip.objects.get(pk=trip["id"]).owner == owner

    def test_validation_errors_are_reported_by_field(self, graphql, owner):
        invalid = {**TRIP_INPUT, "endDate": "2027-06-01", "budget": "-5"}

        response = graphql(CREATE_TRIP, variables={"input": invalid}, user=owner)

        assert response.json()["data"] == {"createTrip": None}
        error = only_error(response)
        assert error["message"] == "Les données envoyées sont invalides."
        assert error["extensions"]["code"] == "validation_error"
        assert set(error["extensions"]["details"]) == {"budget"}  # champs d'abord, puis validate()
        assert not Trip.objects.exists()

    def test_end_before_start(self, graphql, owner):
        invalid = {**TRIP_INPUT, "endDate": "2027-06-01"}

        error = only_error(graphql(CREATE_TRIP, variables={"input": invalid}, user=owner))

        assert error["extensions"]["details"] == {
            "endDate": ["La date de fin doit être postérieure ou égale à la date de début."]
        }

    def test_missing_required_field_gives_400(self, graphql, owner):
        incomplete = {key: value for key, value in TRIP_INPUT.items() if key != "title"}

        response = graphql(CREATE_TRIP, variables={"input": incomplete}, user=owner)

        assert response.status_code == 400
        assert "title" in response.json()["errors"][0]["message"]

    def test_anonymous_cannot_create(self, graphql, db):
        response = graphql(CREATE_TRIP, variables={"input": TRIP_INPUT})

        assert graphql_codes(response) == ["not_authenticated"]
        assert not Trip.objects.exists()


@pytest.mark.django_db
class TestUpdateTrip:
    def test_editor_updates_only_given_fields(self, graphql, members, trip):
        variables = {"id": trip.pk, "input": {"title": "Japon 2027", "status": "PLANNED"}}

        response = graphql(UPDATE_TRIP, variables=variables, user=members["editor"])

        assert graphql_data(response)["updateTrip"]["trip"] == {
            "title": "Japon 2027",
            "status": "PLANNED",
            "budget": None,
            "endDate": "2027-06-20",
        }
        trip.refresh_from_db()
        assert (trip.title, trip.status) == ("Japon 2027", Trip.Status.PLANNED)

    def test_explicit_null_clears_budget(self, graphql, owner, make_trip):
        trip = make_trip(budget=Decimal("100.00"))

        variables = {"id": trip.pk, "input": {"budget": None}}
        graphql_data(graphql(UPDATE_TRIP, variables=variables, user=owner))

        trip.refresh_from_db()
        assert trip.budget is None

    def test_viewer_gets_permission_denied(self, graphql, members, trip):
        variables = {"id": trip.pk, "input": {"title": "Piraté"}}

        response = graphql(UPDATE_TRIP, variables=variables, user=members["viewer"])

        error = only_error(response)
        assert error["extensions"]["code"] == "permission_denied"
        assert error["message"] == (
            "Seuls le propriétaire et les éditeurs peuvent modifier ce voyage."
        )
        trip.refresh_from_db()
        assert trip.title == "Voyage au Japon"

    def test_stranger_gets_not_found(self, graphql, members, trip):
        variables = {"id": trip.pk, "input": {"title": "Piraté"}}

        response = graphql(UPDATE_TRIP, variables=variables, user=members["stranger"])

        assert graphql_codes(response) == ["not_found"]

    def test_model_clean_is_applied(self, graphql, owner, trip, destination):
        # La destination (1er au 7 juin) sortirait du voyage raccourci.
        variables = {"id": trip.pk, "input": {"startDate": "2027-06-05"}}

        error = only_error(graphql(UPDATE_TRIP, variables=variables, user=owner))

        assert error["extensions"]["code"] == "validation_error"
        assert error["message"].startswith("Des destinations de ce voyage sortent")
        assert list(error["extensions"]["details"]) == ["nonFieldErrors"]


@pytest.mark.django_db
class TestDeleteTrip:
    def test_owner_deletes(self, graphql, owner, trip):
        response = graphql(DELETE_TRIP, variables={"id": trip.pk}, user=owner)

        assert graphql_data(response) == {"deleteTrip": {"ok": True, "id": str(trip.pk)}}
        assert not Trip.objects.filter(pk=trip.pk).exists()

    @pytest.mark.parametrize(
        ("member", "code"), [("editor", "permission_denied"), ("stranger", "not_found")]
    )
    def test_others_cannot_delete(self, graphql, members, trip, member, code):
        response = graphql(DELETE_TRIP, variables={"id": trip.pk}, user=members[member])

        assert graphql_codes(response) == [code]
        assert Trip.objects.filter(pk=trip.pk).exists()


@pytest.mark.django_db
class TestCloneTrip:
    def test_viewer_clones_into_own_draft(self, graphql, members, trip, destination, make_activity):
        make_activity(cost=Decimal("20.00"))

        response = graphql(CLONE_TRIP, variables={"id": trip.pk}, user=members["viewer"])

        copy = graphql_data(response)["cloneTrip"]["trip"]
        assert copy["id"] != str(trip.pk)
        assert copy["title"] == "Copie de Voyage au Japon"
        assert copy["status"] == "DRAFT"
        assert copy["owner"] == {"username": "viewer"}
        assert (copy["destinationCount"], copy["activityCount"]) == (1, 1)
        assert copy["totalCost"] == "20.00"

    def test_custom_title(self, graphql, owner, trip):
        variables = {"id": trip.pk, "title": "Japon 2028"}

        copy = graphql_data(graphql(CLONE_TRIP, variables=variables, user=owner))["cloneTrip"]

        assert copy["trip"]["title"] == "Japon 2028"

    def test_stranger_gets_not_found(self, graphql, members, trip):
        response = graphql(CLONE_TRIP, variables={"id": trip.pk}, user=members["stranger"])

        assert graphql_codes(response) == ["not_found"]
        assert Trip.objects.count() == 1

    def test_failure_midway_gives_internal_error_and_creates_nothing(
        self, graphql, owner, trip, destination, make_activity, monkeypatch
    ):
        make_activity()

        def failing_bulk_create(objs, *args, **kwargs):
            raise RuntimeError("panne simulée pendant la copie des activités")

        models = (Trip, TripParticipant, Destination, Activity)
        before = [model.objects.count() for model in models]
        monkeypatch.setattr(Activity.objects, "bulk_create", failing_bulk_create)

        response = graphql(CLONE_TRIP, variables={"id": trip.pk}, user=owner)

        assert graphql_codes(response) == ["internal_error"]
        assert "panne simulée" not in response.content.decode()
        assert [model.objects.count() for model in models] == before


@pytest.mark.django_db
class TestParticipants:
    def test_owner_adds_editor(self, graphql, owner, trip, make_user):
        make_user("mamadou")
        variables = {"tripId": trip.pk, "email": "MAMADOU@example.com", "role": "EDITOR"}

        response = graphql(ADD_PARTICIPANT, variables=variables, user=owner)

        assert graphql_data(response)["addParticipant"]["participant"] == {
            "role": "EDITOR",
            "user": {"username": "mamadou"},
            "invitedBy": {"username": "owner"},
        }

    def test_role_defaults_to_viewer(self, graphql, owner, trip, make_user):
        make_user("mamadou")
        variables = {"tripId": trip.pk, "email": "mamadou@example.com"}

        response = graphql(ADD_PARTICIPANT, variables=variables, user=owner)

        assert graphql_data(response)["addParticipant"]["participant"]["role"] == "VIEWER"

    def test_unknown_email(self, graphql, owner, trip):
        variables = {"tripId": trip.pk, "email": "personne@example.com"}

        error = only_error(graphql(ADD_PARTICIPANT, variables=variables, user=owner))

        assert error["extensions"] == {
            "code": "validation_error",
            "details": {"email": ["Aucun utilisateur n'a ce courriel."]},
        }

    def test_duplicate_is_an_integrity_error(self, graphql, owner, members, trip):
        variables = {"tripId": trip.pk, "email": "viewer@example.com"}

        error = only_error(graphql(ADD_PARTICIPANT, variables=variables, user=owner))

        assert error["extensions"]["code"] == "integrity_error"
        assert error["message"] == "Cet utilisateur participe déjà à ce voyage."

    def test_editor_cannot_add(self, graphql, members, trip, make_user):
        make_user("mamadou")
        variables = {"tripId": trip.pk, "email": "mamadou@example.com"}

        response = graphql(ADD_PARTICIPANT, variables=variables, user=members["editor"])

        assert graphql_codes(response) == ["permission_denied"]
        assert not trip.memberships.filter(user__username="mamadou").exists()

    def test_owner_removes_viewer(self, graphql, owner, members, trip):
        variables = {"tripId": trip.pk, "userId": members["viewer"].pk}

        data = graphql_data(graphql(REMOVE_PARTICIPANT, variables=variables, user=owner))

        assert data["removeParticipant"]["ok"] is True
        remaining = [
            p["user"]["username"] for p in data["removeParticipant"]["trip"]["participants"]
        ]
        assert sorted(remaining) == ["editor", "owner"]

    def test_owner_cannot_remove_self(self, graphql, owner, trip):
        variables = {"tripId": trip.pk, "userId": owner.pk}

        error = only_error(graphql(REMOVE_PARTICIPANT, variables=variables, user=owner))

        assert error["extensions"]["code"] == "validation_error"
        assert error["message"] == LAST_OWNER_MESSAGE
        assert trip.memberships.filter(user=owner, role=Role.OWNER).exists()

    def test_unknown_participant(self, graphql, owner, members, trip):
        variables = {"tripId": trip.pk, "userId": members["stranger"].pk}

        assert graphql_codes(graphql(REMOVE_PARTICIPANT, variables=variables, user=owner)) == [
            "not_found"
        ]

    def test_viewer_cannot_remove(self, graphql, members, trip):
        variables = {"tripId": trip.pk, "userId": members["editor"].pk}

        response = graphql(REMOVE_PARTICIPANT, variables=variables, user=members["viewer"])

        assert graphql_codes(response) == ["permission_denied"]
