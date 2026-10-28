"""Couche HTTP commune aux clients des services externes (Open-Meteo, Countries GraphQL).

request_json() attend 5 s au maximum et fait deux essais. Une erreur réseau, un délai
dépassé ou une réponse 5xx déclenchent le deuxième essai, mais pas une réponse 4xx.
cached() met la réponse brute en cache, seulement si parse() l'a acceptée.

Chaque essai est journalisé (logger apps.integrations.services.http) avec le service,
la méthode, l'URL sans paramètres, le statut (code HTTP, « timeout » ou
« network_error »), la durée en millisecondes et le numéro de l'essai. Ces services
n'ont pas de clé d'API, donc aucune donnée d'authentification ne passe. Les paramètres
ne sont pas journalisés non plus.

Les échecs sont transformés en exceptions de apps.integrations.exceptions, avec le
nom du service dans le message. Un service injoignable ou une réponse 4xx/5xx donne
503, un délai dépassé donne 504 et une réponse inexploitable donne 502.
"""

import logging
import time

import requests
from django.core.cache import cache

from apps.integrations.exceptions import (
    ExternalServiceBadResponse,
    ExternalServiceTimeout,
    ExternalServiceUnavailable,
)

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 5
ATTEMPTS = 2
PARSE_ERRORS = (AttributeError, KeyError, IndexError, TypeError, ValueError)


def new_session():
    session = requests.Session()
    session.headers["User-Agent"] = "TravelHub/1.0"
    return session


def cached(service, cache_key, cache_seconds, load, parse):
    """Réponse analysée par parse(), lue dans le cache ou obtenue avec load().

    parse() peut lever une IntegrationError (par exemple si une donnée manque). Dans ce
    cas, la réponse n'est pas mise en cache. C'est pareil si sa forme est inattendue.
    """
    payload = cache.get(cache_key)
    from_cache = payload is not None
    if not from_cache:
        payload = load()
    try:
        result = parse(payload)
    except PARSE_ERRORS as exc:
        logger.error("Réponse inattendue de %s (%s) : %r", service, cache_key, exc)
        raise ExternalServiceBadResponse(f"{service} a renvoyé une réponse inattendue.") from exc
    if not from_cache:
        cache.set(cache_key, payload, cache_seconds)
    return result


def request_json(session, service, method, url, **kwargs):
    """Envoie la requête avec délai et nouvel essai, puis renvoie le JSON décodé."""
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
        # Pour un 4xx, c'est la requête elle-même qui est refusée. Réessayer ne servirait à rien.
        logger.error("%s a refusé la requête (%s) : %s", service, url, response.text[:200])
        raise ExternalServiceUnavailable(
            f"{service} a refusé la requête (erreur {response.status_code})."
        )
    try:
        return response.json()
    except ValueError as exc:
        raise ExternalServiceBadResponse(f"{service} a renvoyé une réponse illisible.") from exc


def log_call(service, method, url, status, started, attempt):
    """Écrit une ligne par essai, en WARNING si l'essai a échoué ou a été refusé (4xx)."""
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
