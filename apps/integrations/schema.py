"""Types GraphQL pour les données des services externes (lecture seule).

Ils exposent directement les dataclasses renvoyées par les services Open-Meteo et
Countries GraphQL. Les resolvers par défaut lisent leurs attributs.
"""

import graphene

from .services.aggregator import SOURCES


class WeatherUnits(graphene.ObjectType):
    temperature = graphene.String(required=True, description="°C")
    wind_speed = graphene.String(required=True, description="km/h")
    precipitation = graphene.String(required=True, description="mm")


class CurrentWeather(graphene.ObjectType):
    time = graphene.String(required=True, description="Heure locale de la destination (ISO 8601).")
    temperature = graphene.Float()
    wind_speed = graphene.Float()
    precipitation = graphene.Float()
    weather_code = graphene.Int(description="Code météo WMO.")
    description = graphene.String(required=True, description="Libellé français du code météo.")


class DailyForecast(graphene.ObjectType):
    date = graphene.Date(required=True)
    temperature_max = graphene.Float()
    temperature_min = graphene.Float()
    precipitation_sum = graphene.Float()
    wind_speed_max = graphene.Float()
    weather_code = graphene.Int(description="Code météo WMO.")
    description = graphene.String(required=True, description="Libellé français du code météo.")


class Weather(graphene.ObjectType):
    """Météo d'Open-Meteo, avec les conditions actuelles et les prévisions du séjour."""

    latitude = graphene.Float(required=True)
    longitude = graphene.Float(required=True)
    timezone = graphene.String(required=True, description="Fuseau de la destination.")
    units = graphene.Field(WeatherUnits, required=True)
    current = graphene.Field(CurrentWeather, required=True)
    daily = graphene.List(
        graphene.NonNull(DailyForecast),
        required=True,
        description="Jours du séjour compris dans les 16 jours de prévision.",
    )


class Language(graphene.ObjectType):
    name = graphene.String(required=True, description="Nom anglais, ex. Japanese.")
    native = graphene.String(required=True, description="Nom dans la langue, ex. 日本語.")


class CountryInfo(graphene.ObjectType):
    """Pays d'après Countries GraphQL (noms en anglais)."""

    code = graphene.String(required=True, description="Code ISO 3166-1 alpha-2.")
    name = graphene.String(required=True)
    native = graphene.String(required=True, description="Nom dans la langue du pays.")
    capital = graphene.String()
    emoji = graphene.String(required=True, description="Drapeau.")
    currency = graphene.String(description="Codes ISO 4217 séparés par des virgules.")
    currencies = graphene.List(graphene.NonNull(graphene.String), required=True)
    continent = graphene.String(required=True)
    languages = graphene.List(graphene.NonNull(Language), required=True)


OverviewSource = graphene.Enum(
    "OverviewSource",
    [(source.upper(), source) for source in SOURCES],
    description="Bloc de la vue d'ensemble resté vide (null).",
)


class SourceWarning(graphene.ObjectType):
    """Source externe qui a échoué dans une vue d'ensemble (dégradation partielle)."""

    source = graphene.Field(OverviewSource, required=True)
    code = graphene.String(
        required=True, description="Code d'erreur, ex. external_service_unavailable."
    )
    message = graphene.String(required=True)
