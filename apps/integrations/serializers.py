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
