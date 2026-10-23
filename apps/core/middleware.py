"""Identifiant de requête et journal d'accès.

RequestIdMiddleware, premier de MIDDLEWARE :

- reprend l'en-tête X-Request-ID du client ou du proxy s'il est sûr (lettres, chiffres,
  « . _ - », 64 caractères au plus), en génère un sinon ;
- le rend disponible à tous les journaux de la requête (apps.core.logs.request_id_var)
  et le renvoie dans l'en-tête X-Request-ID de la réponse ;
- journalise une ligne par requête : méthode, chemin sans chaîne de requête (qui pourrait
  contenir un jeton), statut, durée et utilisateur. /health/, interrogé par Docker toutes
  les 30 s, n'est journalisé qu'au niveau DEBUG.
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
    """Fin de requête (fermeture de la réponse, après django.request et django.server) :
    les journaux suivants de ce fil ne portent plus l'identifiant."""
    request_id_var.set(None)


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get(HEADER, "")
        if not VALID_REQUEST_ID.fullmatch(request_id):
            request_id = uuid.uuid4().hex
        request.request_id = request_id
        # Pas de remise à zéro en sortie : Django journalise les 4xx et 5xx (django.request)
        # après toute la chaîne de middlewares. clear_request_id() s'en charge à la fin.
        request_id_var.set(request_id)
        started = time.perf_counter()
        response = self.get_response(request)
        response[HEADER] = request_id
        self.log(request, response.status_code, started)
        return response

    @staticmethod
    def log(request, status, started):
        # request.user : l'utilisateur JWT une fois la vue DRF ou GraphQL exécutée.
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
