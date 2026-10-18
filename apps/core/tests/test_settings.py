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
