"""Fixtures pytest partagées par toutes les applications."""

import io
import itertools
from datetime import date

import pytest
import responses
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient

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


@pytest.fixture
def make_trip(owner):
    def _make(**fields):
        fields.setdefault("owner", owner)
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
def make_destination(trip):
    orders = itertools.count(1)

    def _make(**fields):
        fields.setdefault("trip", trip)
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
def make_activity(destination):
    def _make(**fields):
        fields.setdefault("destination", destination)
        fields.setdefault("name", "Temple Senso-ji")
        fields.setdefault("category", Activity.Category.SIGHTSEEING)
        fields.setdefault("date", destination.arrival_date)
        return Activity.objects.create(**fields)

    return _make


@pytest.fixture
def demo_data(db, monkeypatch):
    """Base remplie par la commande seed_demo (comptes de démo sans mot de passe)."""
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    call_command("seed_demo", stdout=io.StringIO())
