"""Opérations métier sur les destinations : coordonnées et météo (Open-Meteo)."""

from decimal import Decimal

from apps.integrations.services import open_meteo

from .models import Destination

COORDINATE_STEP = Decimal("0.000001")  # 6 décimales, comme les champs du modèle


def ensure_coordinates(destination):
    """Géocode la destination si ses coordonnées manquent, et les mémorise en base.

    Les appels suivants réutilisent les coordonnées enregistrées sans interroger le
    géocodage. Des coordonnées déjà saisies ne sont jamais remplacées.
    """
    if destination.latitude is not None and destination.longitude is not None:
        return destination
    location = open_meteo.geocode(destination.city, destination.country_code)
    destination.latitude = Decimal(str(location.latitude)).quantize(COORDINATE_STEP)
    destination.longitude = Decimal(str(location.longitude)).quantize(COORDINATE_STEP)
    # update() plutôt que save() : n'écrit que les coordonnées, sans écraser une
    # modification concurrente, ni toucher updated_at (donnée calculée, pas une saisie).
    Destination.objects.filter(pk=destination.pk, latitude__isnull=True).update(
        latitude=destination.latitude, longitude=destination.longitude
    )
    return destination


def destination_forecast(destination):
    """Météo actuelle et prévisions de la destination pendant le séjour."""
    ensure_coordinates(destination)
    return open_meteo.get_forecast(
        destination.latitude,
        destination.longitude,
        destination.arrival_date,
        destination.departure_date,
    )
