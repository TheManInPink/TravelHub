"""Fixtures pytest partagées par toutes les applications."""

import itertools
from datetime import date

import pytest
from django.contrib.auth import get_user_model

from apps.itinerary.models import Activity, Destination
from apps.trips.services import create_trip

TRIP_START = date(2027, 6, 1)
TRIP_END = date(2027, 6, 20)


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
