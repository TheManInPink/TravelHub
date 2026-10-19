"""Réponses Open-Meteo factices pour les tests (bibliothèque responses)."""

import datetime

from django.utils import timezone

from apps.integrations.services.open_meteo import FORECAST_DAYS


def geocoding_payload(name="Kyoto", latitude=35.02107, longitude=135.75381, **place):
    place = {
        "id": 1857910,
        "name": name,
        "latitude": latitude,
        "longitude": longitude,
        "country_code": "JP",
        "country": "Japon",
        "timezone": "Asia/Tokyo",
        **place,
    }
    return {"results": [place], "generationtime_ms": 0.5}


def forecast_payload(first_day=None, days=FORECAST_DAYS, weather_code=61):
    """Prévisions de days jours à partir de first_day (aujourd'hui par défaut)."""
    first_day = first_day or timezone.localdate()
    dates = [first_day + datetime.timedelta(days=offset) for offset in range(days)]
    return {
        "latitude": 35.0,
        "longitude": 135.75,
        "timezone": "Asia/Tokyo",
        "utc_offset_seconds": 32400,
        "current": {
            "time": f"{first_day:%Y-%m-%d}T09:15",
            "interval": 900,
            "temperature_2m": 17.4,
            "weather_code": 2,
            "wind_speed_10m": 6.1,
            "precipitation": 0.0,
        },
        "daily": {
            "time": [f"{day:%Y-%m-%d}" for day in dates],
            "temperature_2m_max": [20.0 + offset for offset in range(days)],
            "temperature_2m_min": [10.0 + offset for offset in range(days)],
            "precipitation_sum": [0.4] * days,
            "wind_speed_10m_max": [11.2] * days,
            "weather_code": [weather_code] * days,
        },
    }
