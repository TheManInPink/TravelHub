"""GET /api/destinations/{id}/country/ et /overview/ : services externes simulés."""

import threading
from datetime import timedelta
from decimal import Decimal

import pytest
import requests
from django.urls import reverse
from django.utils import timezone

from apps.core.testing import error_of
from apps.integrations.services import aggregator
from apps.integrations.services.countries import GRAPHQL_URL
from apps.integrations.services.open_meteo import FORECAST_URL, GEOCODING_URL
from apps.integrations.testing import country_payload, forecast_payload, geocoding_payload

TODAY = timezone.localdate()
JAPAN = {
    "code": "JP",
    "name": "Japan",
    "native": "日本",
    "capital": "Tokyo",
    "emoji": "🇯🇵",
    "currency": "JPY",
    "currencies": ["JPY"],
    "continent": "Asia",
    "languages": [{"name": "Japanese", "native": "日本語"}],
}


def url(name, destination):
    return reverse(f"destination-{name}", args=[destination.pk])


@pytest.fixture
def trip(make_trip):
    # Remplace la fixture globale : un voyage dans la fenêtre de 16 jours de prévision.
    return make_trip(start_date=TODAY, end_date=TODAY + timedelta(days=10), budget=Decimal(900))


@pytest.fixture
def destination(make_destination):
    return make_destination(
        city="Kyoto",
        arrival_date=TODAY + timedelta(days=1),
        departure_date=TODAY + timedelta(days=4),
    )


@pytest.fixture
def located(make_destination):
    return make_destination(
        city="Kyoto",
        arrival_date=TODAY + timedelta(days=1),
        departure_date=TODAY + timedelta(days=4),
        latitude=Decimal("35.011600"),
        longitude=Decimal("135.768100"),
    )


@pytest.fixture
def activities(make_activity, located):
    return [
        make_activity(destination=located, name="Cérémonie du thé", cost=Decimal("45.00")),
        make_activity(
            destination=located,
            name="Fushimi Inari",
            cost=Decimal("12.50"),
            date=located.arrival_date + timedelta(days=1),
        ),
    ]


@pytest.mark.django_db
class TestCountry:
    def test_viewer_gets_country(self, client_for, members, located, mock_http):
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = client_for(members["viewer"]).get(url("country", located))

        assert response.status_code == 200
        assert response.json() == JAPAN

    def test_unknown_code_gives_404(self, client_for, owner, make_destination, mock_http):
        unknown = make_destination(country_code="ZZ")
        mock_http.post(GRAPHQL_URL, json={"data": {"country": None}})

        response = client_for(owner).get(url("country", unknown))

        assert response.status_code == 404
        assert error_of(response)["code"] == "country_not_found"

    def test_remote_failure_gives_503(self, client_for, owner, located, mock_http):
        mock_http.post(GRAPHQL_URL, status=500)

        response = client_for(owner).get(url("country", located))

        assert response.status_code == 503
        assert error_of(response)["message"] == (
            "Countries GraphQL est momentanément indisponible (erreur 500)."
        )

    def test_stranger_gets_404_without_remote_call(self, client_for, members, located, mock_http):
        response = client_for(members["stranger"]).get(url("country", located))

        assert response.status_code == 404
        assert len(mock_http.calls) == 0


@pytest.mark.django_db
class TestOverview:
    def test_viewer_gets_everything(self, client_for, members, located, activities, mock_http):
        mock_http.get(FORECAST_URL, json=forecast_payload())
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = client_for(members["viewer"]).get(url("overview", located))

        assert response.status_code == 200
        data = response.json()
        assert data["destination"]["id"] == located.pk
        assert data["destination"]["city"] == "Kyoto"
        assert data["trip"] == {
            "id": located.trip_id,
            "title": "Voyage au Japon",
            "status": "draft",
            "start_date": f"{TODAY:%Y-%m-%d}",
            "end_date": f"{TODAY + timedelta(days=10):%Y-%m-%d}",
            "budget": "900.00",
        }
        assert [a["name"] for a in data["activities"]] == ["Cérémonie du thé", "Fushimi Inari"]
        assert data["activity_count"] == 2
        assert data["total_cost"] == "57.50"
        assert data["weather"]["timezone"] == "Asia/Tokyo"
        assert len(data["weather"]["daily"]) == 4
        assert data["country"] == JAPAN
        assert data["warnings"] == []

    def test_open_meteo_down_degrades_with_a_warning(
        self, client_for, owner, located, activities, mock_http
    ):
        mock_http.get(FORECAST_URL, status=503)
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = client_for(owner).get(url("overview", located))

        assert response.status_code == 200
        data = response.json()
        assert data["weather"] is None
        assert data["warnings"] == [
            {
                "source": "weather",
                "code": "external_service_unavailable",
                "message": "Open-Meteo est momentanément indisponible (erreur 503).",
            }
        ]
        assert data["country"] == JAPAN
        assert data["total_cost"] == "57.50"

    def test_countries_timeout_degrades_with_a_warning(self, client_for, owner, located, mock_http):
        mock_http.get(FORECAST_URL, json=forecast_payload())
        mock_http.post(GRAPHQL_URL, body=requests.exceptions.ConnectTimeout())

        data = client_for(owner).get(url("overview", located)).json()

        assert data["country"] is None
        assert data["weather"] is not None
        assert data["warnings"] == [
            {
                "source": "country",
                "code": "external_service_timeout",
                "message": "Countries GraphQL n'a pas répondu en 5 secondes.",
            }
        ]

    def test_both_down_still_returns_database_data(self, client_for, owner, located, mock_http):
        mock_http.get(FORECAST_URL, body=requests.exceptions.ConnectionError())
        mock_http.post(GRAPHQL_URL, json={"errors": [{"message": "Internal error"}]})

        response = client_for(owner).get(url("overview", located))

        assert response.status_code == 200
        data = response.json()
        assert (data["weather"], data["country"]) == (None, None)
        assert [warning["source"] for warning in data["warnings"]] == ["weather", "country"]
        assert data["destination"]["id"] == located.pk
        assert (data["activity_count"], data["total_cost"]) == (0, "0.00")

    def test_stay_beyond_forecast_window_is_a_warning(
        self, client_for, owner, make_trip, make_destination, mock_http
    ):
        later = make_trip(
            start_date=TODAY + timedelta(days=40), end_date=TODAY + timedelta(days=45)
        )
        far = make_destination(
            trip=later,
            arrival_date=later.start_date,
            departure_date=later.end_date,
            latitude=Decimal("35.68"),
            longitude=Decimal("139.69"),
        )
        mock_http.post(GRAPHQL_URL, json=country_payload())  # aucune requête météo

        data = client_for(owner).get(url("overview", far)).json()

        assert data["weather"] is None
        assert data["warnings"][0]["code"] == "no_data_available"
        assert data["country"] == JAPAN

    def test_coordinates_are_saved_even_if_forecast_fails(
        self, client_for, owner, destination, mock_http
    ):
        mock_http.get(GEOCODING_URL, json=geocoding_payload())
        mock_http.get(FORECAST_URL, status=500)
        mock_http.post(GRAPHQL_URL, json=country_payload())

        data = client_for(owner).get(url("overview", destination)).json()

        assert data["destination"]["latitude"] == "35.021070"
        assert data["warnings"][0]["source"] == "weather"
        destination.refresh_from_db()
        assert destination.latitude == Decimal("35.021070")

    def test_unknown_city_is_a_warning(self, client_for, owner, destination, mock_http):
        mock_http.get(GEOCODING_URL, json={"generationtime_ms": 0.3})
        mock_http.post(GRAPHQL_URL, json=country_payload())

        data = client_for(owner).get(url("overview", destination)).json()

        assert data["warnings"][0]["code"] == "location_not_found"
        destination.refresh_from_db()
        assert destination.latitude is None

    def test_stranger_gets_404_without_remote_call(self, client_for, members, located, mock_http):
        response = client_for(members["stranger"]).get(url("overview", located))

        assert response.status_code == 404
        assert len(mock_http.calls) == 0

    def test_authentication_required(self, api_client, located):
        assert api_client.get(url("overview", located)).status_code == 401
        assert api_client.get(url("country", located)).status_code == 401

    @pytest.mark.parametrize(
        ("path", "codes"),
        [
            ("country", {"200", "401", "404", "503", "504"}),
            ("overview", {"200", "401", "404"}),
        ],
    )
    def test_schema_documents_endpoints(self, api_client, path, codes):
        paths = api_client.get(reverse("schema"), {"format": "json"}).json()["paths"]
        assert codes <= set(paths[f"/api/destinations/{{id}}/{path}/"]["get"]["responses"])


@pytest.mark.django_db
class TestParallelCalls:
    def test_external_calls_run_concurrently(self, located, monkeypatch):
        # Chaque appel attend l'autre : exécutés l'un après l'autre, la barrière expirerait.
        barrier = threading.Barrier(2, timeout=5)
        threads = set()

        def meeting(result):
            def call(*args):
                threads.add(threading.get_ident())
                barrier.wait()
                return result

            return call

        monkeypatch.setattr(aggregator, "fetch_forecast", meeting("forecast"))
        monkeypatch.setattr(aggregator.countries, "get_country", meeting("country"))

        overview = aggregator.get_destination_overview(located)

        assert (overview.weather, overview.country, overview.warnings) == (
            "forecast",
            "country",
            [],
        )
        assert len(threads) == 2
        assert threading.get_ident() not in threads
