"""Journal des appels externes : une ligne par essai, avec service, statut et durée."""

import logging

import pytest
import requests

from apps.integrations.exceptions import ExternalServiceTimeout, ExternalServiceUnavailable
from apps.integrations.services.countries import GRAPHQL_URL, get_country
from apps.integrations.services.open_meteo import GEOCODING_URL, geocode
from apps.integrations.testing import country_payload, geocoding_payload


@pytest.fixture
def calls(caplog):
    caplog.set_level(logging.INFO, logger="apps.integrations.services.http")

    def _calls():
        return [r for r in caplog.records if getattr(r, "event", None) == "external_call"]

    return _calls


def test_successful_call(mock_http, calls):
    mock_http.post(GRAPHQL_URL, json=country_payload())

    get_country("JP")

    (record,) = calls()
    assert record.levelno == logging.INFO
    assert record.service == "Countries GraphQL"
    assert record.method == "POST"
    assert record.url == GRAPHQL_URL
    assert record.status == 200
    assert record.attempt == 1
    assert isinstance(record.duration_ms, float) and record.duration_ms >= 0


def test_cache_hit_makes_no_call(mock_http, calls):
    mock_http.post(GRAPHQL_URL, json=country_payload())

    get_country("JP")
    get_country("JP")

    assert len(calls()) == 1


def test_retry_after_5xx_logs_both_attempts(mock_http, calls):
    mock_http.post(GRAPHQL_URL, status=503)
    mock_http.post(GRAPHQL_URL, json=country_payload())

    get_country("JP")

    assert [(r.status, r.attempt, r.levelno) for r in calls()] == [
        (503, 1, logging.WARNING),
        (200, 2, logging.INFO),
    ]


@pytest.mark.parametrize(
    ("error", "status", "exception"),
    [
        (requests.Timeout(), "timeout", ExternalServiceTimeout),
        (requests.ConnectionError(), "network_error", ExternalServiceUnavailable),
    ],
)
def test_network_failures(mock_http, calls, error, status, exception):
    mock_http.post(GRAPHQL_URL, body=error)
    mock_http.post(GRAPHQL_URL, body=error)

    with pytest.raises(exception):
        get_country("JP")

    assert [(r.status, r.attempt) for r in calls()] == [(status, 1), (status, 2)]
    assert all(r.levelno == logging.WARNING for r in calls())


def test_4xx_is_a_warning_without_retry(mock_http, calls):
    mock_http.post(GRAPHQL_URL, status=400, json={"errors": []})

    with pytest.raises(ExternalServiceUnavailable):
        get_country("JP")

    assert [(r.status, r.levelno) for r in calls()] == [(400, logging.WARNING)]


def test_query_parameters_are_not_logged(mock_http, calls, caplog):
    mock_http.get(GEOCODING_URL, json=geocoding_payload())

    geocode("Kyoto", "JP")

    (record,) = calls()
    assert record.url == GEOCODING_URL
    assert "Kyoto" not in caplog.text
