"""Client Open-Meteo pour le géocodage d'une ville et la météo, sans clé d'API.

geocode() appelle https://geocoding-api.open-meteo.com/v1/search et garde le résultat
7 jours en cache. get_forecast() appelle https://api.open-meteo.com/v1/forecast pour
avoir les conditions actuelles et les prévisions des 16 prochains jours. Ce résultat
est gardé 30 minutes.

Pour le délai, le nouvel essai et le cache, voir apps.integrations.services.http.
Seules les réponses exploitables vont dans le cache. Les échecs deviennent des
exceptions de apps.integrations.exceptions et les réponses sont converties en petites
dataclasses.
"""

import dataclasses
import datetime
import hashlib
from dataclasses import dataclass

from django.utils import timezone

from apps.integrations.exceptions import LocationNotFound, NoDataAvailable

from .http import cached, new_session, request_json

SERVICE = "Open-Meteo"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODING_CACHE_SECONDS = 7 * 24 * 60 * 60
FORECAST_CACHE_SECONDS = 30 * 60
FORECAST_DAYS = 16  # maximum d'Open-Meteo, aujourd'hui compris

CURRENT_VARIABLES = ["temperature_2m", "weather_code", "wind_speed_10m", "precipitation"]
DAILY_VARIABLES = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "wind_speed_10m_max",
    "weather_code",
]
# Ce sont les unités par défaut d'Open-Meteo, les requêtes ne les changent pas.
UNITS = {"temperature": "°C", "wind_speed": "km/h", "precipitation": "mm"}

# Codes météo WMO renvoyés dans weather_code.
WEATHER_LABELS = {
    0: "Ciel dégagé",
    1: "Plutôt dégagé",
    2: "Partiellement nuageux",
    3: "Couvert",
    45: "Brouillard",
    48: "Brouillard givrant",
    51: "Bruine légère",
    53: "Bruine modérée",
    55: "Bruine dense",
    56: "Bruine verglaçante légère",
    57: "Bruine verglaçante dense",
    61: "Pluie faible",
    63: "Pluie modérée",
    65: "Pluie forte",
    66: "Pluie verglaçante faible",
    67: "Pluie verglaçante forte",
    71: "Neige faible",
    73: "Neige modérée",
    75: "Neige forte",
    77: "Neige en grains",
    80: "Averses de pluie faibles",
    81: "Averses de pluie modérées",
    82: "Averses de pluie violentes",
    85: "Averses de neige faibles",
    86: "Averses de neige fortes",
    95: "Orage",
    96: "Orage avec grêle faible",
    99: "Orage avec grêle forte",
}
UNKNOWN_WEATHER = "Conditions inconnues"

session = new_session()


def weather_label(code):
    """Libellé français d'un code météo WMO."""
    return WEATHER_LABELS.get(code, UNKNOWN_WEATHER)


@dataclass(frozen=True, slots=True)
class Location:
    name: str
    country: str
    country_code: str
    latitude: float
    longitude: float
    timezone: str


@dataclass(frozen=True, slots=True)
class CurrentWeather:
    time: str  # heure locale de la destination, ISO 8601 sans décalage
    temperature: float | None
    wind_speed: float | None
    precipitation: float | None
    weather_code: int | None

    @property
    def description(self):
        return weather_label(self.weather_code)


@dataclass(frozen=True, slots=True)
class DailyForecast:
    date: datetime.date
    temperature_max: float | None
    temperature_min: float | None
    precipitation_sum: float | None
    wind_speed_max: float | None
    weather_code: int | None

    @property
    def description(self):
        return weather_label(self.weather_code)


@dataclass(frozen=True, slots=True)
class Forecast:
    latitude: float
    longitude: float
    timezone: str
    current: CurrentWeather
    daily: tuple[DailyForecast, ...]

    @property
    def units(self):
        return UNITS


def geocode(city, country_code):
    """Première ville nommée city dans le pays country_code (ISO 3166-1 alpha-2)."""
    city = city.strip()
    country_code = country_code.strip().upper()
    params = {
        "name": city,
        "count": 1,
        "language": "fr",
        "countryCode": country_code,
        "format": "json",
    }

    def parse(payload):
        results = payload.get("results") or []
        if not results:
            raise LocationNotFound(
                f"Ville introuvable : {city} ({country_code}). Vérifiez le nom et le code pays."
            )
        place = results[0]
        return Location(
            name=place["name"],
            country=place.get("country", ""),
            country_code=place.get("country_code", country_code),
            latitude=float(place["latitude"]),
            longitude=float(place["longitude"]),
            timezone=place.get("timezone", ""),
        )

    # On hache le nom pour que la clé soit valide avec n'importe quel backend de cache.
    digest = hashlib.sha256(city.casefold().encode()).hexdigest()
    key = f"open-meteo:geocode:{country_code}:{digest}"
    return _fetch(GEOCODING_URL, params, key, GEOCODING_CACHE_SECONDS, parse)


def forecast_window(today=None):
    """Premier et dernier jour couverts par les prévisions."""
    today = today or timezone.localdate()
    return today, today + datetime.timedelta(days=FORECAST_DAYS - 1)


def get_forecast(latitude, longitude, start, end):
    """Conditions actuelles et prévisions quotidiennes de start à end inclus.

    La période est réduite aux 16 jours de prévision. Si elle n'en touche aucun, on lève
    NoDataAvailable.
    """
    first, last = forecast_window()
    no_data = NoDataAvailable(
        f"Aucune prévision pour le {start:%Y-%m-%d} au {end:%Y-%m-%d} : Open-Meteo ne "
        f"prévoit que les {FORECAST_DAYS} prochains jours ({first:%Y-%m-%d} au {last:%Y-%m-%d})."
    )
    # On garde un jour de marge, car la date locale de la destination peut être
    # différente de celle du serveur.
    margin = datetime.timedelta(days=1)
    if end < first - margin or start > last + margin:
        raise no_data

    # On arrondit à 4 décimales (environ 10 m) pour que des destinations voisines
    # partagent la même entrée de cache.
    latitude, longitude = round(float(latitude), 4), round(float(longitude), 4)
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_VARIABLES),
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto",
        "forecast_days": FORECAST_DAYS,
    }
    # On demande et on met en cache les 16 jours d'un coup, puis on filtre sur la période.
    key = f"open-meteo:forecast:{latitude:.4f}:{longitude:.4f}"
    forecast = _fetch(FORECAST_URL, params, key, FORECAST_CACHE_SECONDS, _parse_forecast)
    daily = tuple(day for day in forecast.daily if start <= day.date <= end)
    if not daily:
        raise no_data
    return dataclasses.replace(forecast, daily=daily)


def _parse_forecast(payload):
    current = payload["current"]
    daily = payload["daily"]
    columns = zip(
        daily["time"],
        daily["temperature_2m_max"],
        daily["temperature_2m_min"],
        daily["precipitation_sum"],
        daily["wind_speed_10m_max"],
        daily["weather_code"],
        strict=True,
    )
    return Forecast(
        latitude=float(payload["latitude"]),
        longitude=float(payload["longitude"]),
        timezone=payload.get("timezone", "GMT"),
        current=CurrentWeather(
            time=current["time"],
            temperature=current["temperature_2m"],
            wind_speed=current["wind_speed_10m"],
            precipitation=current["precipitation"],
            weather_code=current["weather_code"],
        ),
        daily=tuple(
            DailyForecast(datetime.date.fromisoformat(day), *values) for day, *values in columns
        ),
    )


def _fetch(url, params, cache_key, cache_seconds, parse):
    """Réponse analysée par parse(), lue dans le cache ou demandée à Open-Meteo."""
    return cached(
        SERVICE,
        cache_key,
        cache_seconds,
        lambda: request_json(session, SERVICE, "GET", url, params=params),
        parse,
    )
