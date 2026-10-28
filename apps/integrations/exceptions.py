"""Exceptions métier des services externes (Open-Meteo, Countries GraphQL).

Elles ne dépendent pas de DRF, car l'API REST et l'API GraphQL les traduisent chacune
à leur manière. En REST, apps.core.exceptions.exception_handler en fait une réponse
{"error": {...}} avec le statut et le code déclarés ici.
"""


class IntegrationError(Exception):
    status_code = 503
    code = "integration_error"
    default_message = "Le service externe a renvoyé une erreur."

    def __init__(self, message=None):
        self.message = message or self.default_message
        super().__init__(self.message)


class LocationNotFound(IntegrationError):
    """Le géocodage ne trouve pas la ville dans le pays indiqué."""

    status_code = 404
    code = "location_not_found"
    default_message = "Lieu introuvable."


class CountryNotFound(IntegrationError):
    """Countries GraphQL ne connaît pas le code pays demandé."""

    status_code = 404
    code = "country_not_found"
    default_message = "Pays introuvable."


class NoDataAvailable(IntegrationError):
    """Le service répond, mais n'a pas de données pour la période demandée."""

    status_code = 404
    code = "no_data_available"
    default_message = "Aucune donnée disponible pour cette période."


class ExternalServiceUnavailable(IntegrationError):
    """Service injoignable ou en erreur (4xx, ou 5xx même après le nouvel essai)."""

    status_code = 503
    code = "external_service_unavailable"
    default_message = "Le service externe est momentanément indisponible."


class ExternalServiceBadResponse(ExternalServiceUnavailable):
    """Le service a répondu avec des erreurs (liste « errors » de GraphQL) ou avec une
    réponse inexploitable (JSON illisible, forme inattendue)."""

    status_code = 502
    code = "external_service_bad_response"
    default_message = "Le service externe a renvoyé une réponse invalide."


class ExternalServiceTimeout(ExternalServiceUnavailable):
    """Le service n'a pas répondu à temps, et ce à chacun des essais."""

    status_code = 504
    code = "external_service_timeout"
    default_message = "Le service externe n'a pas répondu à temps."
