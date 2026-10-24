"""Service Countries GraphQL : toutes les requêtes HTTP sont simulées par responses."""

import json

import pytest
import requests
from responses import matchers

from apps.integrations.exceptions import (
    CountryNotFound,
    ExternalServiceBadResponse,
    ExternalServiceTimeout,
    ExternalServiceUnavailable,
)
from apps.integrations.services.countries import (
    COUNTRY_QUERY,
    GRAPHQL_URL,
    Country,
    Language,
    get_country,
)
from apps.integrations.testing import country_payload

JAPAN = Country(
    code="JP",
    name="Japan",
    native="日本",
    capital="Tokyo",
    emoji="🇯🇵",
    currency="JPY",
    continent="Asia",
    languages=(Language(name="Japanese", native="日本語"),),
)


class TestGetCountry:
    def test_success_sends_code_as_variable(self, mock_http):
        mock_http.post(
            GRAPHQL_URL,
            json=country_payload(),
            match=[
                matchers.json_params_matcher({"query": COUNTRY_QUERY, "variables": {"code": "JP"}})
            ],
        )

        assert get_country(" jp ") == JAPAN
        sent = json.loads(mock_http.calls[0].request.body)
        assert "JP" not in sent["query"]  # requête paramétrée, sans concaténation

    def test_several_currencies_are_split(self, mock_http):
        mock_http.post(GRAPHQL_URL, json=country_payload(code="US", currency="USD,USN,USS"))

        assert get_country("US").currencies == ["USD", "USN", "USS"]

    def test_missing_capital_and_currency_are_allowed(self, mock_http):
        mock_http.post(GRAPHQL_URL, json=country_payload(code="AQ", capital=None, currency=None))

        country = get_country("AQ")
        assert (country.capital, country.currency, country.currencies) == (None, None, [])

    def test_result_is_cached_24_hours(self, mock_http, cache_timeouts):
        mock_http.post(GRAPHQL_URL, json=country_payload())

        assert get_country("JP") == get_country("jp")
        assert len(mock_http.calls) == 1
        assert cache_timeouts == {"country": 24 * 60 * 60}

    def test_unknown_code_raises_country_not_found_and_is_not_cached(self, mock_http):
        mock_http.post(GRAPHQL_URL, json={"data": {"country": None}})

        for _ in range(2):
            with pytest.raises(CountryNotFound, match="ZZ n'est pas un code pays connu"):
                get_country("ZZ")
        assert len(mock_http.calls) == 2


class TestRemoteFailures:
    def test_graphql_errors_raise_bad_response_and_are_not_cached(self, mock_http):
        # Un serveur GraphQL signale ses erreurs avec un statut 200.
        payload = {
            "errors": [
                {
                    "message": 'Cannot query field "nope" on type "Country".',
                    "extensions": {"code": "GRAPHQL_VALIDATION_FAILED"},
                }
            ]
        }
        mock_http.post(GRAPHQL_URL, json=payload)

        for _ in range(2):
            with pytest.raises(ExternalServiceBadResponse, match='Cannot query field "nope"'):
                get_country("JP")
        assert len(mock_http.calls) == 2

    def test_remote_500_is_retried_once_then_raises_unavailable(self, mock_http):
        mock_http.post(GRAPHQL_URL, status=502)

        with pytest.raises(ExternalServiceUnavailable, match="erreur 502") as caught:
            get_country("JP")
        assert type(caught.value) is ExternalServiceUnavailable
        assert len(mock_http.calls) == 2

    def test_second_attempt_can_succeed(self, mock_http):
        mock_http.post(GRAPHQL_URL, body=requests.exceptions.ConnectionError())
        mock_http.post(GRAPHQL_URL, json=country_payload())

        assert get_country("JP") == JAPAN
        assert len(mock_http.calls) == 2

    def test_timeout_raises_timeout(self, mock_http):
        mock_http.post(GRAPHQL_URL, body=requests.exceptions.ReadTimeout())

        with pytest.raises(ExternalServiceTimeout, match="Countries GraphQL n'a pas répondu"):
            get_country("JP")
        assert len(mock_http.calls) == 2

    def test_client_error_is_not_retried(self, mock_http):
        mock_http.post(GRAPHQL_URL, status=400, json={"errors": [{"message": "Bad request"}]})

        with pytest.raises(ExternalServiceUnavailable, match="erreur 400"):
            get_country("JP")
        assert len(mock_http.calls) == 1

    @pytest.mark.parametrize(
        "response",
        [
            {"body": "<html>Maintenance</html>"},
            {"json": {"data": None}},
            {"json": {"data": {"country": {"code": "JP"}}}},
            {"json": [1, 2, 3]},
        ],
    )
    def test_unexpected_body_raises_bad_response(self, mock_http, response):
        mock_http.post(GRAPHQL_URL, **response)

        with pytest.raises(ExternalServiceBadResponse):
            get_country("JP")
