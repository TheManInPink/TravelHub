"""Opérations métier sur les destinations : coordonnées et météo (Open-Meteo).

locate() et fetch_forecast() ne font aucune requête SQL. L'agrégateur
(apps.integrations.services.aggregator) les appelle depuis un fil secondaire, puis
enregistre les coordonnées depuis le fil principal avec save_coordinates().
"""

from decimal import Decimal

from apps.integrations.services import open_meteo

from .models import Destination

COORDINATE_STEP = Decimal("0.000001")  # 6 décimales, comme les champs du modèle


def locate(destination):
    """Géocode la destination si elle n'a pas de coordonnées, sans écrire en base.

    Renvoie True si on vient de trouver des coordonnées. Il faut alors les enregistrer
    avec save_coordinates(). Les coordonnées déjà saisies ne sont jamais remplacées.
    """
    if destination.latitude is not None and destination.longitude is not None:
        return False
    location = open_meteo.geocode(destination.city, destination.country_code)
    destination.latitude = Decimal(str(location.latitude)).quantize(COORDINATE_STEP)
    destination.longitude = Decimal(str(location.longitude)).quantize(COORDINATE_STEP)
    return True


def save_coordinates(destination):
    """Enregistre en base les coordonnées trouvées par locate()."""
    # On utilise update() et pas save() pour n'écrire que les coordonnées. Ça évite
    # d'écraser une modification faite en même temps et de toucher updated_at, puisque
    # ce n'est pas une saisie de l'utilisateur.
    Destination.objects.filter(pk=destination.pk, latitude__isnull=True).update(
        latitude=destination.latitude, longitude=destination.longitude
    )


def ensure_coordinates(destination):
    """Géocode la destination si elle n'a pas de coordonnées, puis les enregistre.

    Les appels suivants réutilisent les coordonnées en base sans refaire de géocodage.
    """
    if locate(destination):
        save_coordinates(destination)
    return destination


def fetch_forecast(destination):
    """Météo du séjour, avec géocodage si besoin, sans requête SQL."""
    locate(destination)
    return open_meteo.get_forecast(
        destination.latitude,
        destination.longitude,
        destination.arrival_date,
        destination.departure_date,
    )


def destination_forecast(destination):
    """Météo actuelle et prévisions de la destination pendant le séjour."""
    ensure_coordinates(destination)
    return fetch_forecast(destination)
