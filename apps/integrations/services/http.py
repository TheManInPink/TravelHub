"""Couche HTTP commune aux clients des services externes (Open-Meteo, Countries GraphQL).

- request_json() : délai de 5 s et deux essais ; une erreur réseau, un délai dépassé ou
  une réponse 5xx déclenchent le second essai, une réponse 4xx non ;
- cached() : met en cache la réponse brute, seulement si parse() l'a jugée exploitable.

Chaque essai est journalisé (logger apps.integrations.services.http) avec service,
méthode, URL sans paramètres, statut (code HTTP, « timeout » ou « network_error »),
durée en millisecondes et numéro d'essai. Ces services n'ont pas de clé d'API : aucune
donnée d'authentification ne transite, et les paramètres ne sont pas journalisés.

Les échecs deviennent les exceptions de apps.integrations.exceptions, avec le nom du
service dans le message.
"""

import logging
import time

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
        started = time.perf_counter()
        try:
            response = session.request(method, url, timeout=TIMEOUT_SECONDS, **kwargs)
        except requests.Timeout:
            status = "timeout"
            error = ExternalServiceTimeout(
                f"{service} n'a pas répondu en {TIMEOUT_SECONDS} secondes."
            )
        except requests.RequestException:
            status = "network_error"
            error = ExternalServiceUnavailable(f"{service} est injoignable.")
        else:
            status = response.status_code
            error = None
            if status >= 500:
                error = ExternalServiceUnavailable(
                    f"{service} est momentanément indisponible (erreur {status})."
                )
        log_call(service, method, url, status, started, attempt)
        if error is None:
            break
    else:
        raise error

    if not response.ok:
        # 4xx : la requête est refusée telle quelle, un nouvel essai n'y changerait rien.
        logger.error("%s a refusé la requête (%s) : %s", service, url, response.text[:200])
        raise ExternalServiceUnavailable(
            f"{service} a refusé la requête (erreur {response.status_code})."
        )
    try:
        return response.json()
    except ValueError as exc:
        raise ExternalServiceUnavailable(f"{service} a renvoyé une réponse illisible.") from exc


def log_call(service, method, url, status, started, attempt):
    """Une ligne par essai ; WARNING si l'essai a échoué ou a été refusé (4xx)."""
    duration_ms = round((time.perf_counter() - started) * 1000, 1)
    succeeded = isinstance(status, int) and status < 400
    logger.log(
        logging.INFO if succeeded else logging.WARNING,
        "Appel externe %s %s %s : %s en %s ms (essai %d/%d)",
        service,
        method,
        url,
        status,
        duration_ms,
        attempt,
        ATTEMPTS,
        extra={
            "event": "external_call",
            "service": service,
            "method": method,
            "url": url,
            "status": status,
            "duration_ms": duration_ms,
            "attempt": attempt,
        },
    )
