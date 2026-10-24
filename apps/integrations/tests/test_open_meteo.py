"""Service Open-Meteo : toutes les requêtes HTTP sont simulées par responses."""

from datetime import timedelta
from decimal import Decimal

import pytest
import requests
from django.utils import timezone
from responses import matchers

from apps.integrations.exceptions import (
    ExternalServiceBadResponse,
    ExternalServiceTimeout,
    ExternalServiceUnavailable,
    LocationNotFound,
    NoDataAvailable,
)
from apps.integrations.services.open_meteo import (
    FORECAST_URL,
    GEOCODING_URL,
    DailyForecast,
    Location,
    geocode,
    get_forecast,
    weather_label,
)
from apps.integrations.testing import forecast_payload, geocoding_payload


def days_from_today(days):
    return timezone.localdate() + timedelta(days=days)


def kyoto_forecast(start=2, end=5):
    return get_forecast(
        Decimal("35.021070"), Decimal("135.753810"), days_from_today(start), days_from_today(end)
    )


class TestGeocode:
    def test_success_returns_location(self, mock_http):
        mock_http.get(
            GEOCODING_URL,
            json=geocoding_payload(),
            match=[
                matchers.query_param_matcher(
                    {
                        "name": "Kyoto",
                        "count": "1",
                        "language": "fr",
                        "countryCode": "JP",
                        "format": "json",
                    }
                )
            ],
        )

        location = geocode(" Kyoto ", "jp")

        assert location == Location(
            name="Kyoto",
            country="Japon",
            country_code="JP",
            latitude=35.02107,
            longitude=135.75381,
            timezone="Asia/Tokyo",
        )

    def test_result_is_cached_for_seven_days(self, mock_http, cache_timeouts):
        mock_http.get(GEOCODING_URL, json=geocoding_payload())

        assert geocode("Kyoto", "JP") == geocode("kyoto", "JP")
        assert len(mock_http.calls) == 1
        assert cache_timeouts == {"geocode": 7 * 24 * 60 * 60}

    def test_unknown_city_raises_location_not_found(self, mock_http):
        # Sans correspondance, Open-Meteo omet la clé « results ».
        mock_http.get(GEOCODING_URL, json={"generationtime_ms": 0.3})

        with pytest.raises(LocationNotFound, match=r"Atlantide \(GR\)"):
            geocode("Atlantide", "GR")

    def test_unknown_city_is_not_cached(self, mock_http):
        mock_http.get(GEOCODING_URL, json={"generationtime_ms": 0.3})

        for _ in range(2):
            with pytest.raises(LocationNotFound):
                geocode("Atlantide", "GR")
        assert len(mock_http.calls) == 2


class TestForecast:
    def test_success_returns_stay_days_with_french_labels(self, mock_http):
        mock_http.get(
            FORECAST_URL,
            json=forecast_payload(),
            match=[
                matchers.query_param_matcher(
                    {
                        "latitude": "35.0211",
                        "longitude": "135.7538",
                        "current": "temperature_2m,weather_code,wind_speed_10m,precipitation",
                        "daily": (
                            "temperature_2m_max,temperature_2m_min,precipitation_sum,"
                            "wind_speed_10m_max,weather_code"
                        ),
                        "timezone": "auto",
                        "forecast_days": "16",
                    }
                )
            ],
        )

        forecast = kyoto_forecast(start=2, end=5)

        assert forecast.timezone == "Asia/Tokyo"
        assert forecast.units == {"temperature": "°C", "wind_speed": "km/h", "precipitation": "mm"}
        assert forecast.current.temperature == 17.4
        assert forecast.current.description == "Partiellement nuageux"
        assert [day.date for day in forecast.daily] == [days_from_today(n) for n in range(2, 6)]
        assert forecast.daily[0] == DailyForecast(
            date=days_from_today(2),
            temperature_max=22.0,
            temperature_min=12.0,
            precipitation_sum=0.4,
            wind_speed_max=11.2,
            weather_code=61,
        )
        assert forecast.daily[0].description == "Pluie faible"

    def test_long_stay_is_limited_to_the_16_forecast_days(self, mock_http):
        mock_http.get(FORECAST_URL, json=forecast_payload())

        forecast = kyoto_forecast(start=-3, end=30)

        assert len(forecast.daily) == 16
        assert forecast.daily[-1].date == days_from_today(15)

    def test_forecast_is_cached_30_minutes_for_any_stay(self, mock_http, cache_timeouts):
        mock_http.get(FORECAST_URL, json=forecast_payload())

        kyoto_forecast(start=0, end=2)
        later = kyoto_forecast(start=10, end=12)

        assert [day.date for day in later.daily] == [days_from_today(n) for n in (10, 11, 12)]
        assert len(mock_http.calls) == 1
        assert cache_timeouts == {"forecast": 30 * 60}

    @pytest.mark.parametrize(("start", "end"), [(40, 45), (-10, -5)])
    def test_stay_outside_forecast_window_raises_without_calling(self, mock_http, start, end):
        with pytest.raises(NoDataAvailable, match="16 prochains jours"):
            kyoto_forecast(start=start, end=end)
        assert len(mock_http.calls) == 0

    def test_no_returned_day_in_stay_raises_no_data(self, mock_http):
        mock_http.get(FORECAST_URL, json=forecast_payload(days=3))

        with pytest.raises(NoDataAvailable):
            kyoto_forecast(start=10, end=12)

    def test_unknown_weather_code_gets_generic_label(self):
        assert weather_label(42) == "Conditions inconnues"
        assert weather_label(None) == "Conditions inconnues"


class TestRemoteFailures:
    def test_remote_500_is_retried_once_then_raises_unavailable(self, mock_http):
        mock_http.get(GEOCODING_URL, status=500)

        with pytest.raises(ExternalServiceUnavailable, match="erreur 500") as caught:
            geocode("Kyoto", "JP")

        assert type(caught.value) is ExternalServiceUnavailable
        assert len(mock_http.calls) == 2

    def test_second_attempt_can_succeed(self, mock_http):
        mock_http.get(FORECAST_URL, status=503)
        mock_http.get(FORECAST_URL, json=forecast_payload())

        assert len(kyoto_forecast().daily) == 4
        assert len(mock_http.calls) == 2

    def test_timeout_is_retried_once_then_raises_timeout(self, mock_http):
        mock_http.get(FORECAST_URL, body=requests.exceptions.ReadTimeout())

        with pytest.raises(ExternalServiceTimeout, match="5 secondes"):
            kyoto_forecast()
        assert len(mock_http.calls) == 2

    def test_connection_error_raises_unavailable(self, mock_http):
        mock_http.get(GEOCODING_URL, body=requests.exceptions.ConnectionError())

        with pytest.raises(ExternalServiceUnavailable, match="injoignable"):
            geocode("Kyoto", "JP")

    def test_client_error_is_not_retried(self, mock_http):
        mock_http.get(FORECAST_URL, status=400, json={"error": True, "reason": "Invalid"})

        with pytest.raises(ExternalServiceUnavailable, match="erreur 400"):
            kyoto_forecast()
        assert len(mock_http.calls) == 1

    @pytest.mark.parametrize(
        "response",
        [
            {"body": "<html>Maintenance</html>"},
            {"json": {"latitude": 35.0}},
            {"json": [1, 2, 3]},
        ],
    )
    def test_unexpected_body_raises_bad_response_and_is_not_cached(self, mock_http, response):
        mock_http.get(FORECAST_URL, **response)

        for _ in range(2):
            with pytest.raises(ExternalServiceBadResponse):
                kyoto_forecast()
        assert len(mock_http.calls) == 2
