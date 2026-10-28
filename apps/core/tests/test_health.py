"""Tests de GET /health/, le contrôle de santé de Docker (base de données et cache)."""

import logging

import pytest
from django.db import OperationalError
from django.urls import reverse

from apps.core import views

pytestmark = pytest.mark.django_db


def test_healthy(api_client):
    response = api_client.get(reverse("health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "cache": "ok"}}
    assert "no-cache" in response["Cache-Control"]


def test_needs_no_authentication_nor_throttle(api_client, settings):
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {"anon": "1/hour", "user": "1/hour"},
    }

    statuses = {api_client.get(reverse("health")).status_code for _ in range(3)}

    assert statuses == {200}


def test_head_is_allowed_but_not_post(api_client):
    assert api_client.head(reverse("health")).status_code == 200
    assert api_client.post(reverse("health")).status_code == 405


def test_database_down(api_client, monkeypatch, caplog):
    def broken_cursor():
        raise OperationalError("connection refused: mot de passe interne")

    monkeypatch.setattr(views.connection, "cursor", broken_cursor)

    with caplog.at_level(logging.ERROR, logger="apps.core.views"):
        response = api_client.get(reverse("health"))

    assert response.status_code == 503
    assert response.json() == {"status": "error", "checks": {"database": "error", "cache": "ok"}}
    assert "mot de passe interne" not in response.content.decode()  # cause non divulguée
    assert "base de données injoignable" in caplog.text  # mais journalisée


def test_cache_down(api_client, monkeypatch, caplog):
    def broken_set(*args, **kwargs):
        raise ConnectionError("Redis injoignable")

    monkeypatch.setattr(views.cache, "set", broken_set)

    with caplog.at_level(logging.ERROR, logger="apps.core.views"):
        response = api_client.get(reverse("health"))

    assert response.status_code == 503
    assert response.json()["checks"] == {"database": "ok", "cache": "error"}
    assert "cache injoignable" in caplog.text


def test_cache_losing_values(api_client, monkeypatch):
    monkeypatch.setattr(views.cache, "get", lambda key: None)

    response = api_client.get(reverse("health"))

    assert response.status_code == 503
    assert response.json()["checks"]["cache"] == "error"
