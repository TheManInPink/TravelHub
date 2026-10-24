"""API GraphQL des destinations et activités : requêtes, vue d'ensemble, mutations."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.core.testing import graphql_codes, graphql_data
from apps.integrations.services.countries import GRAPHQL_URL
from apps.integrations.services.open_meteo import FORECAST_URL, GEOCODING_URL
from apps.integrations.testing import country_payload, forecast_payload, geocoding_payload
from apps.itinerary.models import Activity, Destination
from apps.trips.models import TripParticipant

Role = TripParticipant.Role

TODAY = timezone.localdate()

DESTINATION = """
query Destination($id: ID!) {
  destination(id: $id) {
    city countryCode trip { title } activities { name }
  }
}
"""

DESTINATION_WITH_SERVICES = """
query Destination($id: ID!) {
  destination(id: $id) {
    city
    weather { timezone current { description } daily { date description } }
    countryInfo { name capital currencies languages { name } }
  }
}
"""

OVERVIEW = """
query Overview($id: ID!) {
  destinationOverview(id: $id) {
    destination { city latitude }
    trip { title budget }
    activities { name }
    activityCount
    totalCost
    weather { timezone units { temperature } daily { date } }
    country { code name emoji }
    warnings { source code message }
  }
}
"""

CREATE_DESTINATION = """
mutation Create($input: DestinationCreateInput!) {
  createDestination(input: $input) { destination { id city countryCode order trip { id } } }
}
"""

UPDATE_DESTINATION = """
mutation Update($id: ID!, $input: DestinationUpdateInput!) {
  updateDestination(id: $id, input: $input) { destination { city latitude longitude } }
}
"""

DELETE_DESTINATION = "mutation Delete($id: ID!) { deleteDestination(id: $id) { ok id } }"

CREATE_ACTIVITY = """
mutation Create($input: ActivityCreateInput!) {
  createActivity(input: $input) {
    activity { name category date startTime cost destination { city } }
  }
}
"""

UPDATE_ACTIVITY = """
mutation Update($id: ID!, $input: ActivityUpdateInput!) {
  updateActivity(id: $id, input: $input) { activity { name cost category } }
}
"""

DELETE_ACTIVITY = "mutation Delete($id: ID!) { deleteActivity(id: $id) { ok id } }"


def only_error(response):
    errors = response.json()["errors"]
    assert len(errors) == 1, errors
    return errors[0]


@pytest.mark.django_db
class TestDestinationQuery:
    def test_viewer_reads_destination(self, graphql, members, destination, make_activity):
        make_activity(name="Senso-ji")

        response = graphql(DESTINATION, variables={"id": destination.pk}, user=members["viewer"])

        assert graphql_data(response) == {
            "destination": {
                "city": "Tokyo",
                "countryCode": "JP",
                "trip": {"title": "Voyage au Japon"},
                "activities": [{"name": "Senso-ji"}],
            }
        }

    def test_stranger_gets_not_found(self, graphql, members, destination):
        response = graphql(DESTINATION, variables={"id": destination.pk}, user=members["stranger"])

        assert response.json()["data"] == {"destination": None}
        assert only_error(response)["message"] == "Destination introuvable."
        assert graphql_codes(response) == ["not_found"]

    def test_anonymous_gets_not_authenticated(self, graphql, destination):
        response = graphql(DESTINATION, variables={"id": destination.pk})

        assert graphql_codes(response) == ["not_authenticated"]


@pytest.fixture
def located(make_trip, make_destination):
    """Destination géolocalisée dans la fenêtre de 16 jours de prévision."""
    trip = make_trip(start_date=TODAY, end_date=TODAY + timedelta(days=10), budget=900)
    return make_destination(
        trip=trip,
        city="Kyoto",
        arrival_date=TODAY + timedelta(days=1),
        departure_date=TODAY + timedelta(days=4),
        latitude=Decimal("35.011600"),
        longitude=Decimal("135.768100"),
    )


@pytest.mark.django_db
class TestExternalFields:
    def test_weather_and_country_on_destination(self, graphql, owner, located, mock_http):
        mock_http.get(FORECAST_URL, json=forecast_payload())
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = graphql(DESTINATION_WITH_SERVICES, variables={"id": located.pk}, user=owner)

        data = graphql_data(response)["destination"]
        assert data["weather"]["timezone"] == "Asia/Tokyo"
        assert data["weather"]["current"] == {"description": "Partiellement nuageux"}
        assert len(data["weather"]["daily"]) == 4
        assert data["countryInfo"] == {
            "name": "Japan",
            "capital": "Tokyo",
            "currencies": ["JPY"],
            "languages": [{"name": "Japanese"}],
        }

    def test_service_failure_only_nulls_its_field(self, graphql, owner, located, mock_http):
        mock_http.get(FORECAST_URL, status=503)
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = graphql(DESTINATION_WITH_SERVICES, variables={"id": located.pk}, user=owner)

        body = response.json()
        assert response.status_code == 200
        assert body["data"]["destination"]["weather"] is None
        assert body["data"]["destination"]["countryInfo"]["name"] == "Japan"
        error = only_error(response)
        assert error["path"] == ["destination", "weather"]
        assert error["extensions"]["code"] == "external_service_unavailable"
        assert error["message"] == "Open-Meteo est momentanément indisponible (erreur 503)."

    def test_unknown_country_code(self, graphql, owner, make_destination, mock_http):
        unknown = make_destination(country_code="ZZ")
        mock_http.post(GRAPHQL_URL, json={"data": {"country": None}})

        response = graphql(
            "query ($id: ID!) { destination(id: $id) { countryInfo { name } } }",
            variables={"id": unknown.pk},
            user=owner,
        )

        assert graphql_codes(response) == ["country_not_found"]

    def test_remote_graphql_errors_are_reported(self, graphql, owner, located, mock_http):
        mock_http.post(GRAPHQL_URL, json={"errors": [{"message": "Internal server error"}]})

        response = graphql(
            "query ($id: ID!) { destination(id: $id) { countryInfo { name } } }",
            variables={"id": located.pk},
            user=owner,
        )

        error = only_error(response)
        assert error["extensions"]["code"] == "external_service_bad_response"
        assert error["message"] == "Countries GraphQL a renvoyé une erreur : Internal server error"


@pytest.mark.django_db
class TestDestinationOverview:
    def test_viewer_gets_everything(self, graphql, make_user, located, make_activity, mock_http):
        viewer = make_user("viewer")
        TripParticipant.objects.create(trip=located.trip, user=viewer, role=Role.VIEWER)
        make_activity(destination=located, name="Cérémonie du thé", cost=Decimal("45.00"))
        mock_http.get(FORECAST_URL, json=forecast_payload())
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = graphql(OVERVIEW, variables={"id": located.pk}, user=viewer)

        data = graphql_data(response)["destinationOverview"]
        assert data["destination"] == {"city": "Kyoto", "latitude": "35.011600"}
        assert data["trip"] == {"title": "Voyage au Japon", "budget": "900.00"}
        assert data["activities"] == [{"name": "Cérémonie du thé"}]
        assert (data["activityCount"], data["totalCost"]) == (1, "45.00")
        assert data["weather"]["units"] == {"temperature": "°C"}
        assert len(data["weather"]["daily"]) == 4
        assert data["country"] == {"code": "JP", "name": "Japan", "emoji": "🇯🇵"}
        assert data["warnings"] == []

    def test_partial_degradation_is_not_an_error(self, graphql, owner, located, mock_http):
        mock_http.get(FORECAST_URL, json=forecast_payload())
        mock_http.post(GRAPHQL_URL, status=500)

        response = graphql(OVERVIEW, variables={"id": located.pk}, user=owner)

        data = graphql_data(response)["destinationOverview"]  # aucune erreur GraphQL
        assert data["country"] is None
        assert data["weather"] is not None
        assert data["warnings"] == [
            {
                "source": "COUNTRY",
                "code": "external_service_unavailable",
                "message": "Countries GraphQL est momentanément indisponible (erreur 500).",
            }
        ]

    def test_geocodes_and_saves_coordinates(self, graphql, owner, make_destination, mock_http):
        destination = make_destination(arrival_date=TODAY, departure_date=TODAY + timedelta(days=2))
        destination.trip.start_date = TODAY
        destination.trip.save()
        mock_http.get(GEOCODING_URL, json=geocoding_payload())
        mock_http.get(FORECAST_URL, json=forecast_payload())
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = graphql(OVERVIEW, variables={"id": destination.pk}, user=owner)

        assert graphql_data(response)["destinationOverview"]["destination"]["latitude"] == (
            "35.021070"
        )
        destination.refresh_from_db()
        assert destination.latitude == Decimal("35.021070")

    def test_stranger_gets_not_found_without_remote_call(
        self, graphql, members, located, mock_http
    ):
        response = graphql(OVERVIEW, variables={"id": located.pk}, user=members["stranger"])

        assert graphql_codes(response) == ["not_found"]
        assert len(mock_http.calls) == 0

    def test_anonymous_gets_not_authenticated(self, graphql, located, mock_http):
        response = graphql(OVERVIEW, variables={"id": located.pk})

        assert graphql_codes(response) == ["not_authenticated"]
        assert len(mock_http.calls) == 0


def destination_input(trip, **fields):
    return {
        "trip": trip.pk,
        "order": 2,
        "city": "Kyoto",
        "country": "Japon",
        "countryCode": "jp",
        "arrivalDate": "2027-06-08",
        "departureDate": "2027-06-12",
        **fields,
    }


@pytest.mark.django_db
class TestDestinationMutations:
    def test_editor_creates_destination(self, graphql, members, trip):
        variables = {"input": destination_input(trip)}

        response = graphql(CREATE_DESTINATION, variables=variables, user=members["editor"])

        created = graphql_data(response)["createDestination"]["destination"]
        assert created["city"] == "Kyoto"
        assert created["countryCode"] == "JP"  # normalisé par le serializer
        assert created["trip"] == {"id": str(trip.pk)}
        assert Destination.objects.filter(pk=created["id"], trip=trip).exists()

    @pytest.mark.parametrize(
        ("member", "code"), [("viewer", "permission_denied"), ("stranger", "not_found")]
    )
    def test_create_requires_edit_rights(self, graphql, members, trip, member, code):
        variables = {"input": destination_input(trip)}

        response = graphql(CREATE_DESTINATION, variables=variables, user=members[member])

        assert graphql_codes(response) == [code]
        assert not Destination.objects.exists()

    def test_anonymous_cannot_create(self, graphql, trip):
        response = graphql(CREATE_DESTINATION, variables={"input": destination_input(trip)})

        assert graphql_codes(response) == ["not_authenticated"]

    def test_model_clean_is_applied(self, graphql, owner, trip):
        variables = {"input": destination_input(trip, arrivalDate="2027-05-20")}

        error = only_error(graphql(CREATE_DESTINATION, variables=variables, user=owner))

        assert error["extensions"] == {
            "code": "validation_error",
            "details": {
                "arrivalDate": ["L'arrivée ne peut pas précéder le début du voyage (2027-06-01)."]
            },
        }

    def test_changing_city_clears_coordinates(self, graphql, members, make_destination):
        destination = make_destination(latitude=Decimal("35.68"), longitude=Decimal("139.69"))
        variables = {"id": destination.pk, "input": {"city": "Osaka"}}

        response = graphql(UPDATE_DESTINATION, variables=variables, user=members["editor"])

        assert graphql_data(response)["updateDestination"]["destination"] == {
            "city": "Osaka",
            "latitude": None,
            "longitude": None,
        }

    def test_viewer_cannot_update(self, graphql, members, destination):
        variables = {"id": destination.pk, "input": {"city": "Osaka"}}

        response = graphql(UPDATE_DESTINATION, variables=variables, user=members["viewer"])

        assert graphql_codes(response) == ["permission_denied"]
        destination.refresh_from_db()
        assert destination.city == "Tokyo"

    def test_editor_deletes(self, graphql, members, destination):
        response = graphql(
            DELETE_DESTINATION, variables={"id": destination.pk}, user=members["editor"]
        )

        assert graphql_data(response)["deleteDestination"] == {
            "ok": True,
            "id": str(destination.pk),
        }
        assert not Destination.objects.exists()

    @pytest.mark.parametrize(
        ("member", "code"), [("viewer", "permission_denied"), ("stranger", "not_found")]
    )
    def test_others_cannot_delete(self, graphql, members, destination, member, code):
        response = graphql(
            DELETE_DESTINATION, variables={"id": destination.pk}, user=members[member]
        )

        assert graphql_codes(response) == [code]
        assert Destination.objects.filter(pk=destination.pk).exists()


def activity_input(destination, **fields):
    return {
        "destination": destination.pk,
        "name": "Cérémonie du thé",
        "category": "CULTURE",
        "date": "2027-06-03",
        "startTime": "14:00:00",
        "cost": "45.00",
        **fields,
    }


@pytest.mark.django_db
class TestActivityMutations:
    def test_editor_creates_activity(self, graphql, members, destination):
        variables = {"input": activity_input(destination)}

        response = graphql(CREATE_ACTIVITY, variables=variables, user=members["editor"])

        assert graphql_data(response)["createActivity"]["activity"] == {
            "name": "Cérémonie du thé",
            "category": "CULTURE",
            "date": "2027-06-03",
            "startTime": "14:00:00",
            "cost": "45.00",
            "destination": {"city": "Tokyo"},
        }

    def test_category_defaults_to_other(self, graphql, owner, destination):
        variables = {"input": activity_input(destination, category=None)}
        del variables["input"]["category"]

        response = graphql(CREATE_ACTIVITY, variables=variables, user=owner)

        assert graphql_data(response)["createActivity"]["activity"]["category"] == "OTHER"

    def test_date_outside_stay(self, graphql, owner, destination):
        variables = {"input": activity_input(destination, date="2027-06-15")}

        error = only_error(graphql(CREATE_ACTIVITY, variables=variables, user=owner))

        assert error["extensions"]["code"] == "validation_error"
        assert error["extensions"]["details"] == {
            "date": [
                "La date de l'activité doit être comprise dans le séjour à Tokyo "
                "(2027-06-01 au 2027-06-07)."
            ]
        }
        assert not Activity.objects.exists()

    def test_negative_cost(self, graphql, owner, destination):
        variables = {"input": activity_input(destination, cost="-1")}

        error = only_error(graphql(CREATE_ACTIVITY, variables=variables, user=owner))

        assert list(error["extensions"]["details"]) == ["cost"]

    @pytest.mark.parametrize(
        ("member", "code"), [("viewer", "permission_denied"), ("stranger", "not_found")]
    )
    def test_create_requires_edit_rights(self, graphql, members, destination, member, code):
        variables = {"input": activity_input(destination)}

        response = graphql(CREATE_ACTIVITY, variables=variables, user=members[member])

        assert graphql_codes(response) == [code]

    def test_editor_updates(self, graphql, members, make_activity):
        activity = make_activity()
        variables = {"id": activity.pk, "input": {"cost": "18.00", "category": "FOOD"}}

        response = graphql(UPDATE_ACTIVITY, variables=variables, user=members["editor"])

        assert graphql_data(response)["updateActivity"]["activity"] == {
            "name": "Temple Senso-ji",
            "cost": "18.00",
            "category": "FOOD",
        }

    @pytest.mark.parametrize(
        ("member", "code"), [("viewer", "permission_denied"), ("stranger", "not_found")]
    )
    def test_others_cannot_update(self, graphql, members, make_activity, member, code):
        activity = make_activity()
        variables = {"id": activity.pk, "input": {"cost": "0"}}

        response = graphql(UPDATE_ACTIVITY, variables=variables, user=members[member])

        assert graphql_codes(response) == [code]

    def test_owner_deletes(self, graphql, owner, make_activity):
        activity = make_activity()

        response = graphql(DELETE_ACTIVITY, variables={"id": activity.pk}, user=owner)

        assert graphql_data(response)["deleteActivity"] == {"ok": True, "id": str(activity.pk)}
        assert not Activity.objects.exists()

    def test_viewer_cannot_delete(self, graphql, members, make_activity):
        activity = make_activity()

        response = graphql(DELETE_ACTIVITY, variables={"id": activity.pk}, user=members["viewer"])

        assert graphql_codes(response) == ["permission_denied"]
        assert Activity.objects.filter(pk=activity.pk).exists()


@pytest.mark.django_db
def test_anonymous_mutation_writes_nothing(graphql, destination):
    response = graphql(CREATE_ACTIVITY, variables={"input": activity_input(destination)})

    assert graphql_codes(response) == ["not_authenticated"]
    assert not Activity.objects.exists()
