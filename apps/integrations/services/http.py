"""Couche HTTP commune aux clients des services externes (Open-Meteo, Countries GraphQL).

- request_json() : délai de 5 s et deux essais ; une erreur réseau, un délai dépassé ou
  une réponse 5xx déclenchent le second essai, une réponse 4xx non ;
- cached() : met en cache la réponse brute, seulement si parse() l'a jugée exploitable.

Les échecs deviennent les exceptions de apps.integrations.exceptions, avec le nom du
service dans le message.
"""

import logging

import requests
from django.core.cache import cache

from apps.integrations.exceptions import ExternalServiceTimeout, ExternalServiceUnavailable

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 5
ATTEMPTS = 2
PARSE_ERRORS = (AttributeError, KeyError, IndexError, TypeError, ValueError)


def new_session():
    session = requests.Session()
    session.headers["User-Agent"] = "TravelHub/1.0"
    return session


def cached(service, cache_key, cache_seconds, load, parse):
    """Réponse analysée par parse(), lue dans le cache ou obtenue par load().

    parse() peut lever une IntegrationError (donnée absente…) : la réponse n'est alors
    pas mise en cache, pas plus qu'une réponse dont la forme est inattendue.
    """
    payload = cache.get(cache_key)
    from_cache = payload is not None
    if not from_cache:
        payload = load()
    try:
        result = parse(payload)
    except PARSE_ERRORS as exc:
        logger.error("Réponse inattendue de %s (%s) : %r", service, cache_key, exc)
        raise ExternalServiceUnavailable(f"{service} a renvoyé une réponse inattendue.") from exc
    if not from_cache:
        cache.set(cache_key, payload, cache_seconds)
    return result


def request_json(session, service, method, url, **kwargs):
    """Requête avec délai et nouvel essai ; renvoie le JSON décodé."""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            response = session.request(method, url, timeout=TIMEOUT_SECONDS, **kwargs)
        except requests.Timeout:
            error = ExternalServiceTimeout(
                f"{service} n'a pas répondu en {TIMEOUT_SECONDS} secondes."
            )
        except requests.RequestException:
            error = ExternalServiceUnavailable(f"{service} est injoignable.")
        else:
            if response.status_code < 500:
                break
            error = ExternalServiceUnavailable(
                f"{service} est momentanément indisponible (erreur {response.status_code})."
            )
        logger.warning("%s, essai %d/%d échoué (%s) : %s", service, attempt, ATTEMPTS, url, error)
    else:
        raise error

    if not response.ok:
        # 4xx : la requête est refusée telle quelle, un nouvel essai n'y changerait rien.
        logger.error("%s a refusé la requête (%s) : %s", service, response.url, response.text[:200])
        raise ExternalServiceUnavailable(
            f"{service} a refusé la requête (erreur {response.status_code})."
        )
    try:
        return response.json()
    except ValueError as exc:
        raise ExternalServiceUnavailable(f"{service} a renvoyé une réponse illisible.") from exc
