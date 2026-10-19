"""Client Open-Meteo : géocodage d'une ville et prévisions météo, sans clé d'API.

- geocode() interroge https://geocoding-api.open-meteo.com/v1/search ; cache 7 jours ;
- get_forecast() interroge https://api.open-meteo.com/v1/forecast : conditions actuelles
  et prévisions quotidiennes des 16 prochains jours ; cache 30 minutes.

Chaque requête a un délai de 5 s et deux essais : une erreur réseau, un délai dépassé ou
une réponse 5xx déclenchent le second essai, une réponse 4xx non. Seules les réponses
exploitables sont mises en cache. Les échecs deviennent les exceptions de
apps.integrations.exceptions ; les réponses deviennent des dataclasses compactes.
"""

import dataclasses
import datetime
import hashlib
import logging
from dataclasses import dataclass

import requests
from django.core.cache import cache
from django.utils import timezone

from apps.integrations.exceptions import (
    ExternalServiceTimeout,
    ExternalServiceUnavailable,
    LocationNotFound,
    NoDataAvailable,
)

logger = logging.getLogger(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT_SECONDS = 5
ATTEMPTS = 2
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
# Unités par défaut d'Open-Meteo : les requêtes ne les changent pas.
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

session = requests.Session()
session.headers["User-Agent"] = "TravelHub/1.0"


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

    # Le nom passe par un condensat : la clé reste valide pour tout backend de cache.
    digest = hashlib.sha256(city.casefold().encode()).hexdigest()
    key = f"open-meteo:geocode:{country_code}:{digest}"
    return _fetch(GEOCODING_URL, params, key, GEOCODING_CACHE_SECONDS, parse)


def forecast_window(today=None):
    """Premier et dernier jour couverts par les prévisions."""
    today = today or timezone.localdate()
    return today, today + datetime.timedelta(days=FORECAST_DAYS - 1)


def get_forecast(latitude, longitude, start, end):
    """Conditions actuelles et prévisions quotidiennes du start au end inclus.

    La période est ramenée aux 16 jours de prévision : NoDataAvailable si elle n'en
    recoupe aucun.
    """
    first, last = forecast_window()
    no_data = NoDataAvailable(
        f"Aucune prévision pour le {start:%Y-%m-%d} au {end:%Y-%m-%d} : Open-Meteo ne "
        f"prévoit que les {FORECAST_DAYS} prochains jours ({first:%Y-%m-%d} au {last:%Y-%m-%d})."
    )
    # Marge d'un jour : la date locale de la destination peut différer de celle du serveur.
    margin = datetime.timedelta(days=1)
    if end < first - margin or start > last + margin:
        raise no_data

    # 4 décimales (~10 m) : des destinations voisines partagent la même entrée de cache.
    latitude, longitude = round(float(latitude), 4), round(float(longitude), 4)
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_VARIABLES),
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto",
        "forecast_days": FORECAST_DAYS,
    }
    # Les 16 jours sont demandés et mis en cache d'un bloc, puis filtrés sur la période.
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
    """Réponse analysée par parse(), lue dans le cache ou demandée au service."""
    payload = cache.get(cache_key)
    from_cache = payload is not None
    if not from_cache:
        payload = _get_json(url, params)
    try:
        result = parse(payload)
    except (AttributeError, KeyError, IndexError, TypeError, ValueError) as exc:
        logger.error("Réponse inattendue d'Open-Meteo (%s) : %r", url, exc)
        raise ExternalServiceUnavailable("Open-Meteo a renvoyé une réponse inattendue.") from exc
    if not from_cache:
        cache.set(cache_key, payload, cache_seconds)
    return result


def _get_json(url, params):
    """GET avec délai et nouvel essai ; renvoie le JSON décodé."""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            response = session.get(url, params=params, timeout=TIMEOUT_SECONDS)
        except requests.Timeout:
            error = ExternalServiceTimeout(
                f"Open-Meteo n'a pas répondu en {TIMEOUT_SECONDS} secondes."
            )
        except requests.RequestException:
            error = ExternalServiceUnavailable("Open-Meteo est injoignable.")
        else:
            if response.status_code < 500:
                break
            error = ExternalServiceUnavailable(
                f"Open-Meteo est momentanément indisponible (erreur {response.status_code})."
            )
        logger.warning("Open-Meteo, essai %d/%d échoué (%s) : %s", attempt, ATTEMPTS, url, error)
    else:
        raise error

    if not response.ok:
        # 4xx : la requête est refusée telle quelle, un nouvel essai n'y changerait rien.
        logger.error("Open-Meteo a refusé la requête (%s) : %s", response.url, response.text[:200])
        raise ExternalServiceUnavailable(
            f"Open-Meteo a refusé la requête (erreur {response.status_code})."
        )
    try:
        return response.json()
    except ValueError as exc:
        raise ExternalServiceUnavailable("Open-Meteo a renvoyé une réponse illisible.") from exc
