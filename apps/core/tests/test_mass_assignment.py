"""Affectation de masse (OWASP API3 : Broken Object Property Level Authorization).

Un client ne peut écrire que les champs prévus : propriétaire, identifiants, horodatages,
totaux calculés et droits d'administration sont en lecture seule ou absents, et les
valeurs envoyées pour eux sont ignorées (REST) ou refusées (GraphQL, schéma typé).
"""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts.serializers import LogoutSerializer, RegisterSerializer
from apps.core.testing import error_of
from apps.itinerary.models import Activity, Destination
from apps.itinerary.serializers import ActivitySerializer, DestinationSerializer
from apps.trips.models import Trip, TripParticipant
from apps.trips.serializers import (
    ParticipantCreateSerializer,
    ParticipantRoleSerializer,
    TripCloneSerializer,
    TripSerializer,
)

User = get_user_model()

FORGED = {
    "id": 999999,
    "created_at": "2000-01-01T00:00:00Z",
    "updated_at": "2000-01-01T00:00:00Z",
}


@pytest.mark.parametrize(
    "serializer_class, writable",
    [
        (TripSerializer, {"title", "description", "start_date", "end_date", "status", "budget"}),
        (
            DestinationSerializer,
            {
                "trip",
                "order",
                "city",
                "country",
                "country_code",
                "arrival_date",
                "departure_date",
                "latitude",
                "longitude",
            },
        ),
        (
            ActivitySerializer,
            {"destination", "name", "description", "category", "date", "start_time", "cost"},
        ),
        (RegisterSerializer, {"username", "email", "password", "first_name", "last_name"}),
        (ParticipantCreateSerializer, {"email", "role"}),
        (ParticipantRoleSerializer, {"role"}),
        (TripCloneSerializer, {"title"}),
        (LogoutSerializer, {"refresh"}),
    ],
    ids=lambda value: getattr(value, "__name__", ""),
)
def test_writable_fields_are_an_explicit_whitelist(serializer_class, writable):
    """Un champ ajouté au modèle ou au serializer ne devient pas modifiable par mégarde."""
    fields = serializer_class().fields
    assert {name for name, field in fields.items() if not field.read_only} == writable


@pytest.mark.django_db
class TestRest:
    def test_trip_creation_ignores_owner_and_computed_fields(self, client_a, user_a, user_b):
        payload = {
            **FORGED,
            "title": "Voyage",
            "start_date": "2027-06-01",
            "end_date": "2027-06-10",
            "owner": user_b.pk,
            "destination_count": 42,
            "total_cost": "9999.00",
        }

        response = client_a.post(reverse("trip-list"), payload, format="json")

        assert response.status_code == 201
        trip = Trip.objects.get()
        assert response.data["id"] == trip.pk != FORGED["id"]
        assert trip.owner == user_a
        assert trip.created_at.year > 2000
        assert response.data["destination_count"] == 0
        assert response.data["total_cost"] == "0.00"
        assert not trip.memberships.filter(user=user_b).exists()

    def test_trip_update_cannot_change_owner(self, client_a, trip_a, user_a, user_b):
        url = reverse("trip-detail", args=[trip_a.pk])

        response = client_a.patch(url, {"owner": user_b.pk, **FORGED}, format="json")

        assert response.status_code == 200
        trip_a.refresh_from_db()
        assert (trip_a.pk, trip_a.owner) == (response.data["id"], user_a)
        assert list(trip_a.participants.all()) == [user_a]

    def test_destination_ignores_forged_identifiers(self, client_a, trip_a):
        payload = {
            **FORGED,
            "trip": trip_a.pk,
            "order": 1,
            "city": "Kyoto",
            "country": "Japon",
            "country_code": "JP",
            "arrival_date": "2027-06-02",
            "departure_date": "2027-06-04",
        }

        response = client_a.post(reverse("destination-list"), payload, format="json")

        assert response.status_code == 201
        destination = Destination.objects.get()
        assert destination.pk != FORGED["id"]
        assert destination.created_at.year > 2000

    def test_activity_trip_is_derived_from_its_destination(self, client_a, destination_a, trip_b):
        payload = {
            "destination": destination_a.pk,
            "trip": trip_b.pk,
            "name": "Musée",
            "date": "2027-06-02",
        }

        response = client_a.post(reverse("activity-list"), payload, format="json")

        assert response.status_code == 201
        assert response.data["trip"] == destination_a.trip_id
        assert Activity.objects.get().destination.trip_id == destination_a.trip_id

    def test_registration_cannot_grant_privileges(self, api_client):
        payload = {
            "username": "mallory",
            "email": "mallory@example.com",
            "password": "Voyage-Montreal-2027",
            "is_staff": True,
            "is_superuser": True,
            "is_active": False,
            "groups": [1],
            "user_permissions": [1],
            "date_joined": "2000-01-01T00:00:00Z",
        }

        response = api_client.post(reverse("auth:register"), payload, format="json")

        assert response.status_code == 201
        user = User.objects.get(username="mallory")
        assert (user.is_staff, user.is_superuser, user.is_active) == (False, False, True)
        assert not user.groups.exists()
        assert not user.user_permissions.exists()
        assert user.date_joined.year > 2000

    def test_invitation_cannot_grant_ownership(self, client_a, trip_a, user_a, user_b):
        url = reverse("trip-participants", args=[trip_a.pk])

        response = client_a.post(url, {"email": user_b.email, "role": "owner"}, format="json")

        assert response.status_code == 400
        assert "role" in error_of(response)["details"]
        assert trip_a.memberships.get(role=TripParticipant.Role.OWNER).user == user_a

    def test_profile_is_read_only(self, client_a, user_a):
        response = client_a.patch(reverse("auth:me"), {"is_staff": True}, format="json")

        assert response.status_code == 405
        user_a.refresh_from_db()
        assert not user_a.is_staff


@pytest.mark.django_db
class TestGraphql:
    @pytest.mark.parametrize(
        "mutation",
        [
            'createTrip(input: {{title: "V", startDate: "2027-06-01", endDate: "2027-06-02", '
            'owner: "{other}"}}) {{ trip {{ id }} }}',
            'updateTrip(id: "{trip}", input: {{owner: "{other}"}}) {{ trip {{ id }} }}',
            'updateTrip(id: "{trip}", input: {{id: "{other}"}}) {{ trip {{ id }} }}',
            'updateDestination(id: "{destination}", input: {{trip: "{other}"}}) '
            "{{ destination {{ id }} }}",
            'updateActivity(id: "{activity}", input: {{destination: "{other}"}}) '
            "{{ activity {{ id }} }}",
        ],
    )
    def test_unknown_input_fields_are_rejected(self, graphql, user_a, trip_b, activity_a, mutation):
        """Les types d'entrée n'ont pas ces champs : la requête est refusée avant exécution."""
        ids = {
            "trip": activity_a.destination.trip_id,
            "destination": activity_a.destination_id,
            "activity": activity_a.pk,
            "other": trip_b.pk,
        }
        before = {model: list(model.objects.values()) for model in (Trip, Destination, Activity)}

        response = graphql(f"mutation {{ {mutation.format(**ids)} }}", user=user_a)

        assert response.status_code == 400
        [error] = response.json()["errors"]
        assert "is not defined by type" in error["message"]
        assert {model: list(model.objects.values()) for model in before} == before

    def test_user_type_exposes_no_privileges(self, graphql, user_a):
        response = graphql("query { me { isStaff } }", user=user_a)

        assert response.status_code == 400
        assert "Cannot query field 'isStaff'" in response.json()["errors"][0]["message"]
