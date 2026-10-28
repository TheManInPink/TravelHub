"""Vue d'ensemble d'une destination avec les données de la base, la météo et le pays.

Open-Meteo et Countries GraphQL sont appelés en parallèle (ThreadPoolExecutor)
pendant que le fil principal lit la base. Les fils secondaires ne font aucune requête
SQL. Sinon, chaque fil aurait sa propre connexion jamais fermée et ne verrait pas la
transaction en cours dans le fil principal. Chaque tâche tourne dans une copie du
contexte du fil principal, ce qui garde l'identifiant de requête dans les journaux.

Si une source échoue, la vue d'ensemble ne plante pas. Le bloc de cette source vaut
None et un avertissement {source, code, message} explique ce qui s'est passé
(dégradation partielle).
"""

import contextvars
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from decimal import Decimal

from apps.integrations.exceptions import IntegrationError
from apps.itinerary.models import Activity, Destination
from apps.itinerary.services import fetch_forecast, save_coordinates

from . import countries
from .countries import Country
from .open_meteo import Forecast

WEATHER = "weather"
COUNTRY = "country"
SOURCES = (WEATHER, COUNTRY)


@dataclass(frozen=True, slots=True)
class SourceWarning:
    source: str  # WEATHER ou COUNTRY
    code: str  # code de l'IntegrationError, ex. external_service_unavailable
    message: str


@dataclass(frozen=True, slots=True)
class DestinationOverview:
    destination: Destination
    activities: list[Activity]
    weather: Forecast | None
    country: Country | None
    warnings: list[SourceWarning] = field(default_factory=list)

    @property
    def activity_count(self):
        return len(self.activities)

    @property
    def total_cost(self):
        return sum((activity.cost for activity in self.activities), Decimal("0.00"))


def get_destination_overview(destination):
    """Destination, voyage, activités et coût total, avec la météo et le pays.

    destination.trip doit déjà être chargé (select_related), car le voyage fait partie
    de la réponse. Si la destination n'a pas de coordonnées, on la géocode et on
    enregistre ses coordonnées, comme pour l'endpoint météo.
    """
    geocoding = destination.latitude is None or destination.longitude is None
    with ThreadPoolExecutor(max_workers=len(SOURCES), thread_name_prefix="overview") as pool:
        # Une copie par tâche, car un même contexte ne peut pas tourner dans deux fils.
        futures = {
            WEATHER: pool.submit(contextvars.copy_context().run, fetch_forecast, destination),
            COUNTRY: pool.submit(
                contextvars.copy_context().run, countries.get_country, destination.country_code
            ),
        }
        activities = list(destination.activities.all())  # pendant les appels externes
        results, warnings = {}, []
        for source, future in futures.items():
            try:
                results[source] = future.result()
            except IntegrationError as exc:
                results[source] = None
                warnings.append(SourceWarning(source, exc.code, exc.message))

    # Le géocodage peut réussir même si la météo échoue ensuite.
    if geocoding and destination.latitude is not None:
        save_coordinates(destination)
    return DestinationOverview(
        destination=destination,
        activities=activities,
        weather=results[WEATHER],
        country=results[COUNTRY],
        warnings=warnings,
    )
