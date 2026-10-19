"""Représentation JSON des dataclasses des services externes (lecture seule)."""

from rest_framework import serializers


class UnitsSerializer(serializers.Serializer):
    temperature = serializers.CharField(help_text="°C")
    wind_speed = serializers.CharField(help_text="km/h")
    precipitation = serializers.CharField(help_text="mm")


class CurrentWeatherSerializer(serializers.Serializer):
    time = serializers.CharField(help_text="Heure locale de la destination (ISO 8601).")
    temperature = serializers.FloatField(allow_null=True)
    wind_speed = serializers.FloatField(allow_null=True)
    precipitation = serializers.FloatField(allow_null=True)
    weather_code = serializers.IntegerField(allow_null=True, help_text="Code météo WMO.")
    description = serializers.CharField(help_text="Libellé français du code météo.")


class DailyForecastSerializer(serializers.Serializer):
    date = serializers.DateField()
    temperature_max = serializers.FloatField(allow_null=True)
    temperature_min = serializers.FloatField(allow_null=True)
    precipitation_sum = serializers.FloatField(allow_null=True)
    wind_speed_max = serializers.FloatField(allow_null=True)
    weather_code = serializers.IntegerField(allow_null=True, help_text="Code météo WMO.")
    description = serializers.CharField(help_text="Libellé français du code météo.")


class ForecastSerializer(serializers.Serializer):
    timezone = serializers.CharField(help_text="Fuseau de la destination, ex. Asia/Tokyo.")
    units = UnitsSerializer()
    current = CurrentWeatherSerializer()
    daily = DailyForecastSerializer(
        many=True, help_text="Jours du séjour compris dans les 16 jours de prévision."
    )


class LanguageSerializer(serializers.Serializer):
    name = serializers.CharField(help_text="Nom anglais, ex. Japanese.")
    native = serializers.CharField(help_text="Nom dans la langue elle-même, ex. 日本語.")


class CountrySerializer(serializers.Serializer):
    code = serializers.CharField(help_text="Code ISO 3166-1 alpha-2.")
    name = serializers.CharField(help_text="Nom anglais, tel que fourni par Countries GraphQL.")
    native = serializers.CharField(help_text="Nom dans la langue du pays.")
    capital = serializers.CharField(allow_null=True)
    emoji = serializers.CharField(help_text="Drapeau.")
    currency = serializers.CharField(
        allow_null=True, help_text="Codes ISO 4217 séparés par des virgules, tels que fournis."
    )
    currencies = serializers.ListField(
        child=serializers.CharField(), help_text="Les mêmes codes, en liste."
    )
    continent = serializers.CharField(help_text="Nom anglais du continent.")
    languages = LanguageSerializer(many=True)
