"""GET /api/destinations/{id}/weather/ : Open-Meteo est simulé par responses."""

from datetime import timedelta
from decimal import Decimal

import pytest
import requests
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone

from apps.core.testing import error_of
from apps.integrations.services.open_meteo import FORECAST_URL, GEOCODING_URL
from apps.integrations.testing import forecast_payload, geocoding_payload

TODAY = timezone.localdate()


def weather_url(destination):
    return reverse("destination-weather", args=[destination.pk])


def calls_to(mock_http, url):
    return sum(call.request.url.startswith(url) for call in mock_http.calls)


@pytest.fixture
def trip(make_trip):
    # Remplace la fixture globale : un voyage dans la fenêtre de 16 jours de prévision.
    return make_trip(start_date=TODAY, end_date=TODAY + timedelta(days=10))


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


@pytest.mark.django_db
class TestWeather:
    def test_viewer_gets_weather_and_coordinates_are_saved(
        self, client_for, members, destination, mock_http
    ):
        mock_http.get(GEOCODING_URL, json=geocoding_payload())
        mock_http.get(FORECAST_URL, json=forecast_payload())
        updated_at = destination.updated_at

        response = client_for(members["viewer"]).get(weather_url(destination))

        assert response.status_code == 200
        data = response.json()
        assert data["destination"] == destination.pk
        assert (data["latitude"], data["longitude"]) == ("35.021070", "135.753810")
        assert data["timezone"] == "Asia/Tokyo"
        assert data["current"]["description"] == "Partiellement nuageux"
        assert [day["date"] for day in data["daily"]] == [
            f"{TODAY + timedelta(days=n):%Y-%m-%d}" for n in range(1, 5)
        ]
        assert data["daily"][0] == {
            "date": f"{TODAY + timedelta(days=1):%Y-%m-%d}",
            "temperature_max": 21.0,
            "temperature_min": 11.0,
            "precipitation_sum": 0.4,
            "wind_speed_max": 11.2,
            "weather_code": 61,
            "description": "Pluie faible",
        }
        destination.refresh_from_db()
        assert destination.latitude == Decimal("35.021070")
        assert destination.longitude == Decimal("135.753810")
        assert destination.updated_at == updated_at

    def test_saved_coordinates_spare_later_geocoding(
        self, client_for, owner, destination, mock_http
    ):
        mock_http.get(GEOCODING_URL, json=geocoding_payload())
        mock_http.get(FORECAST_URL, json=forecast_payload())
        client = client_for(owner)

        assert client.get(weather_url(destination)).status_code == 200
        assert client.get(weather_url(destination)).status_code == 200  # météo en cache
        cache.clear()  # même sans cache, les coordonnées viennent de la base
        assert client.get(weather_url(destination)).status_code == 200

        assert calls_to(mock_http, GEOCODING_URL) == 1
        assert calls_to(mock_http, FORECAST_URL) == 2

    def test_existing_coordinates_are_kept(self, client_for, owner, located, mock_http):
        # Aucun géocodage déclaré : une requête de géocodage ferait échouer le test.
        mock_http.get(FORECAST_URL, json=forecast_payload())

        response = client_for(owner).get(weather_url(located))

        assert response.status_code == 200
        assert response.json()["latitude"] == "35.011600"

    def test_unknown_city_gives_404(self, client_for, owner, destination, mock_http):
        mock_http.get(GEOCODING_URL, json={"generationtime_ms": 0.3})

        response = client_for(owner).get(weather_url(destination))

        assert response.status_code == 404
        assert error_of(response)["code"] == "location_not_found"
        assert error_of(response)["message"].startswith("Ville introuvable : Kyoto (JP)")
        destination.refresh_from_db()
        assert destination.latitude is None

    def test_stay_beyond_forecast_window_gives_404(
        self, client_for, owner, make_destination, mock_http
    ):
        far = make_destination(
            arrival_date=TODAY + timedelta(days=40),
            departure_date=TODAY + timedelta(days=45),
            latitude=Decimal("35.68"),
            longitude=Decimal("139.69"),
        )

        response = client_for(owner).get(weather_url(far))

        assert response.status_code == 404
        assert error_of(response)["code"] == "no_data_available"
        assert len(mock_http.calls) == 0

    def test_remote_500_gives_503(self, client_for, owner, located, mock_http):
        mock_http.get(FORECAST_URL, status=500)

        response = client_for(owner).get(weather_url(located))

        assert response.status_code == 503
        assert error_of(response)["code"] == "external_service_unavailable"
        assert len(mock_http.calls) == 2

    def test_timeout_gives_504(self, client_for, owner, destination, mock_http):
        mock_http.get(GEOCODING_URL, body=requests.exceptions.ConnectTimeout())

        response = client_for(owner).get(weather_url(destination))

        assert response.status_code == 504
        assert error_of(response) == {
            "code": "external_service_timeout",
            "message": "Open-Meteo n'a pas répondu en 5 secondes.",
            "details": {},
        }

    def test_stranger_gets_404_without_remote_call(
        self, client_for, members, destination, mock_http
    ):
        response = client_for(members["stranger"]).get(weather_url(destination))
        assert response.status_code == 404
        assert error_of(response)["code"] == "not_found"
        assert len(mock_http.calls) == 0

    def test_authentication_required(self, api_client, destination):
        assert api_client.get(weather_url(destination)).status_code == 401

    def test_schema_documents_remote_errors(self, api_client):
        paths = api_client.get(reverse("schema"), {"format": "json"}).json()["paths"]
        responses = paths["/api/destinations/{id}/weather/"]["get"]["responses"]
        assert {"200", "401", "404", "502", "503", "504"} <= set(responses)


@pytest.mark.django_db
class TestCoordinatesFollowTheCity:
    def detail_url(self, destination):
        return reverse("destination-detail", args=[destination.pk])

    def test_new_city_clears_saved_coordinates(self, client_for, owner, located):
        response = client_for(owner).patch(self.detail_url(located), {"city": "Osaka"})

        assert response.status_code == 200
        assert (response.data["latitude"], response.data["longitude"]) == (None, None)

    def test_new_city_keeps_coordinates_sent_with_it(self, client_for, owner, located):
        response = client_for(owner).patch(
            self.detail_url(located),
            {"city": "Osaka", "latitude": "34.693700", "longitude": "135.502300"},
        )

        assert response.status_code == 200
        assert response.data["latitude"] == "34.693700"

    @pytest.mark.parametrize("changes", [{"order": 5}, {"city": "Kyoto"}])
    def test_other_changes_keep_coordinates(self, client_for, owner, located, changes):
        response = client_for(owner).patch(self.detail_url(located), changes)

        assert response.status_code == 200
        assert response.data["latitude"] == "35.011600"
