"""Fixtures pytest partagées par toutes les applications."""

import io
import itertools
from datetime import date
from decimal import Decimal

import pytest
import responses
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.urls import reverse
from graphene_django.utils.testing import graphql_query
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.itinerary.models import Activity, Destination
from apps.trips.models import TripParticipant
from apps.trips.services import create_trip

TRIP_START = date(2027, 6, 1)
TRIP_END = date(2027, 6, 20)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Les compteurs de throttling vivent dans le cache : chaque test repart de zéro."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def mock_http():
    """Intercepte les requêtes HTTP de requests : aucune ne part sur le réseau.

    Une requête non déclarée lève ConnectionError ; une réponse déclarée mais jamais
    demandée fait échouer le test.
    """
    with responses.RequestsMock() as mock:
        yield mock


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def client_for():
    """Client API authentifié comme user, sans passer par l'émission d'un JWT."""

    def _make(user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    return _make


@pytest.fixture
def graphql(client):
    """Envoie une requête à /graphql/ avec le client de test de graphene-django.

    user est authentifié par un vrai jeton d'accès (Authorization: Bearer), comme un
    client réel ; token permet d'envoyer un jeton quelconque.
    """

    def _execute(query, variables=None, user=None, token=None):
        if user is not None:
            token = str(AccessToken.for_user(user))
        headers = {"Authorization": f"Bearer {token}"} if token is not None else None
        return graphql_query(
            query,
            variables=variables,
            headers=headers,
            client=client,
            graphql_url=reverse("graphql"),
        )

    return _execute


@pytest.fixture
def make_user(db):
    counter = itertools.count(1)

    def _make(username=None, **extra):
        username = username or f"user{next(counter)}"
        return get_user_model().objects.create_user(
            username, email=f"{username}@example.com", password="pw-Secret-123", **extra
        )

    return _make


@pytest.fixture
def owner(make_user):
    return make_user("owner")


# Fabriques : chaque fixture make_* crée un objet valide et accepte n'importe quel champ.
# Le parent par défaut (owner, trip, destination) n'est créé que s'il n'est pas fourni.


@pytest.fixture
def make_trip(request):
    def _make(**fields):
        if "owner" not in fields:
            fields["owner"] = request.getfixturevalue("owner")
        fields.setdefault("title", "Voyage au Japon")
        fields.setdefault("start_date", TRIP_START)
        fields.setdefault("end_date", TRIP_END)
        return create_trip(**fields)

    return _make


@pytest.fixture
def trip(make_trip):
    return make_trip()


@pytest.fixture
def members(trip, make_user):
    """Un éditeur, un lecteur et un utilisateur étranger au voyage du propriétaire."""
    editor, viewer, stranger = make_user("editor"), make_user("viewer"), make_user("stranger")
    TripParticipant.objects.create(trip=trip, user=editor, role=TripParticipant.Role.EDITOR)
    TripParticipant.objects.create(trip=trip, user=viewer, role=TripParticipant.Role.VIEWER)
    return {"editor": editor, "viewer": viewer, "stranger": stranger}


@pytest.fixture
def make_destination(request):
    orders = itertools.count(1)

    def _make(**fields):
        if "trip" not in fields:
            fields["trip"] = request.getfixturevalue("trip")
        fields.setdefault("city", "Tokyo")
        fields.setdefault("country", "Japon")
        fields.setdefault("country_code", "JP")
        fields.setdefault("arrival_date", date(2027, 6, 1))
        fields.setdefault("departure_date", date(2027, 6, 7))
        fields.setdefault("order", next(orders))
        return Destination.objects.create(**fields)

    return _make


@pytest.fixture
def destination(make_destination):
    return make_destination()


@pytest.fixture
def make_activity(request):
    def _make(**fields):
        if "destination" not in fields:
            fields["destination"] = request.getfixturevalue("destination")
        fields.setdefault("name", "Temple Senso-ji")
        fields.setdefault("category", Activity.Category.SIGHTSEEING)
        fields.setdefault("date", fields["destination"].arrival_date)
        return Activity.objects.create(**fields)

    return _make


# Deux utilisateurs étrangers l'un à l'autre, chacun avec un voyage, une destination et
# une activité : base des tests d'accès croisés (Broken Object Level Authorization).


@pytest.fixture
def user_a(make_user):
    return make_user("alice")


@pytest.fixture
def user_b(make_user):
    return make_user("bob")


@pytest.fixture
def trip_a(make_trip, user_a):
    return make_trip(owner=user_a, title="Voyage d'Alice", budget=Decimal("2000.00"))


@pytest.fixture
def destination_a(make_destination, trip_a):
    return make_destination(trip=trip_a)


@pytest.fixture
def activity_a(make_activity, destination_a):
    return make_activity(destination=destination_a, cost=Decimal("25.00"))


@pytest.fixture
def trip_b(make_trip, user_b):
    return make_trip(owner=user_b, title="Voyage de Bob")


@pytest.fixture
def destination_b(make_destination, trip_b):
    return make_destination(trip=trip_b, city="Paris", country="France", country_code="FR")


@pytest.fixture
def activity_b(make_activity, destination_b):
    return make_activity(destination=destination_b, name="Louvre")


@pytest.fixture
def client_a(client_for, user_a):
    return client_for(user_a)


@pytest.fixture
def client_b(client_for, user_b):
    return client_for(user_b)


@pytest.fixture
def demo_data(db, monkeypatch):
    """Base remplie par la commande seed_demo (comptes de démo sans mot de passe)."""
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    call_command("seed_demo", stdout=io.StringIO())
