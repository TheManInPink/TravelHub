"""Identifiant de requête et journal d'accès.

RequestIdMiddleware doit être le premier de MIDDLEWARE. Il reprend l'en-tête
X-Request-ID envoyé par le client ou le proxy s'il est sûr (lettres, chiffres,
« . _ - », 64 caractères au plus). Sinon, il en génère un nouveau.

L'identifiant est disponible pour tous les journaux de la requête
(apps.core.logs.request_id_var) et il est renvoyé dans l'en-tête X-Request-ID
de la réponse.

Le middleware écrit aussi une ligne par requête avec la méthode, le chemin, le statut,
la durée et l'utilisateur. Le chemin est journalisé sans la chaîne de requête, qui
pourrait contenir un jeton. /health/ est appelé par Docker toutes les 30 s, donc il
n'est journalisé qu'au niveau DEBUG.
"""

import logging
import re
import time
import uuid

from django.core.signals import request_finished
from django.dispatch import receiver

from .logs import request_id_var

logger = logging.getLogger("travelhub.request")

HEADER = "X-Request-ID"
VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")
QUIET_PATHS = frozenset({"/health/"})


@receiver(request_finished, dispatch_uid="travelhub.clear_request_id")
def clear_request_id(**kwargs):
    """Fin de la requête, quand la réponse est fermée.

    Ça arrive après django.request et django.server. Les journaux suivants de ce fil
    n'ont plus l'identifiant.
    """
    request_id_var.set(None)


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get(HEADER, "")
        if not VALID_REQUEST_ID.fullmatch(request_id):
            request_id = uuid.uuid4().hex
        request.request_id = request_id
        # On ne remet pas l'identifiant à zéro ici. Django journalise les 4xx et 5xx
        # (django.request) après toute la chaîne de middlewares. C'est clear_request_id()
        # qui s'en occupe à la fin.
        request_id_var.set(request_id)
        started = time.perf_counter()
        response = self.get_response(request)
        response[HEADER] = request_id
        self.log(request, response.status_code, started)
        return response

    @staticmethod
    def log(request, status, started):
        # Après la vue DRF ou GraphQL, request.user est l'utilisateur du JWT.
        user = getattr(request, "user", None)
        level = logging.DEBUG if request.path in QUIET_PATHS else logging.INFO
        logger.log(
            level,
            "%s %s %s",
            request.method,
            request.path,
            status,
            extra={
                "method": request.method,
                "path": request.path,
                "status": status,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                "user_id": user.pk if user is not None and user.is_authenticated else None,
            },
        )
