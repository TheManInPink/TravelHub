import runpy

import pytest
from django.conf import settings
from django.db import connection


def test_secret_key_comes_from_environment():
    assert not settings.SECRET_KEY.startswith("django-insecure")
    assert len(settings.SECRET_KEY) >= 50


@pytest.mark.django_db
def test_database_is_postgresql():
    assert connection.vendor == "postgresql"


def test_locale_and_timezone():
    assert settings.LANGUAGE_CODE == "fr-ca"
    assert settings.TIME_ZONE == "America/Toronto"
    assert settings.USE_TZ is True


@pytest.mark.parametrize(
    ("variables", "expected"),
    [
        ({}, "0.0.0.0:8000"),
        ({"PORT": "10000"}, "0.0.0.0:10000"),
        ({"PORT": "10000", "GUNICORN_BIND": "127.0.0.1:9000"}, "127.0.0.1:9000"),
    ],
)
def test_gunicorn_listens_on_port_given_by_the_platform(monkeypatch, variables, expected):
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("GUNICORN_BIND", raising=False)
    for name, value in variables.items():
        monkeypatch.setenv(name, value)

    config = runpy.run_path(str(settings.BASE_DIR / "gunicorn.conf.py"))

    assert config["bind"] == expected
