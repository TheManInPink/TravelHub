"""Gestionnaire d'exceptions global de l'API REST.

Toutes les erreurs ont la même forme :

    {"error": {"code": "validation_error", "message": "…", "details": {"end_date": ["…"]}}}

Le code est un identifiant stable que le client peut tester (validation_error,
not_authenticated, permission_denied, not_found, integrity_error, throttled, etc.).
Le message est une phrase lisible. details contient les erreurs par champ quand il
s'agit d'une validation. Sinon, c'est un objet vide.

Les ValidationError de Django (levées par les services et par Model.clean()) donnent
un 400 au lieu d'une 500. C'est pareil pour les IntegrityError, par exemple quand deux
requêtes simultanées violent une contrainte. Les erreurs des services externes
(apps.integrations.exceptions) gardent leur statut (404, 502, 503 ou 504) et leur code.

error_body() construit le même corps pour l'API GraphQL (apps.core.views).
"""

from functools import cache

from django.apps import apps
from django.core.exceptions import NON_FIELD_ERRORS
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from rest_framework import exceptions
from rest_framework.serializers import as_serializer_error
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler as drf_exception_handler

from apps.integrations.exceptions import IntegrationError

VALIDATION_MESSAGE = "Les données envoyées sont invalides."
INTEGRITY_MESSAGE = "L'opération viole une contrainte d'intégrité des données."


def django_error_detail(exc):
    """Erreurs d'une ValidationError Django, remises au format DRF {champ: [messages]}.

    La clé « __all__ » de Django devient « non_field_errors », comme dans les serializers.
    """
    detail = as_serializer_error(exc)
    if NON_FIELD_ERRORS in detail:
        detail.setdefault(api_settings.NON_FIELD_ERRORS_KEY, [])
        detail[api_settings.NON_FIELD_ERRORS_KEY] += detail.pop(NON_FIELD_ERRORS)
    return detail


@cache
def _constraint_messages():
    """Associe le nom de chaque contrainte des modèles à son message d'erreur."""
    return {
        constraint.name: constraint.get_violation_error_message()
        for model in apps.get_models()
        for constraint in model._meta.constraints
    }


def integrity_error_message(exc):
    """Retrouve le message de la contrainte violée à partir du nom renvoyé par PostgreSQL."""
    diag = getattr(exc.__cause__, "diag", None)  # psycopg expose le diagnostic du serveur
    name = getattr(diag, "constraint_name", None)
    return _constraint_messages().get(name, INTEGRITY_MESSAGE)


def to_api_exception(exc):
    """Traduit une exception Django ou d'un service externe en APIException de DRF.

    Renvoie un couple (exception, code). Si code n'est pas None, il remplace le code de
    l'exception. Une exception qu'on ne connaît pas est renvoyée sans changement.
    """
    code = None
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(django_error_detail(exc))
    elif isinstance(exc, IntegrityError):
        code = "integrity_error"
        exc = exceptions.ValidationError(
            {api_settings.NON_FIELD_ERRORS_KEY: [integrity_error_message(exc)]}
        )
    elif isinstance(exc, Http404):
        # Le message de get_object_or_404 est en anglais et donne le nom du modèle.
        # On préfère garder le message générique de DRF, qui est traduit.
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied(*exc.args)
    elif isinstance(exc, IntegrationError):
        status_code = exc.status_code
        exc = exceptions.APIException(exc.message, code=exc.code)
        exc.status_code = status_code
    return exc, code


def exception_handler(exc, context):
    """EXCEPTION_HANDLER de DRF.

    Convertit l'exception, laisse DRF construire la réponse, puis l'enveloppe.
    """
    exc, code = to_api_exception(exc)
    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # erreur inattendue, Django renverra une 500
    response.data = {"error": _error_body(exc, response.data, code)}
    return response


def error_body(exc):
    """Corps {"code", "message", "details"} d'une exception, comme dans une erreur REST.

    Utilisé par l'API GraphQL. Renvoie None pour une exception inattendue, car son
    message ne doit pas être montré au client.
    """
    exc, code = to_api_exception(exc)
    if not isinstance(exc, exceptions.APIException):
        return None
    # Même forme que response.data dans le gestionnaire de DRF.
    data = exc.detail if isinstance(exc.detail, list | dict) else {"detail": exc.detail}
    return _error_body(exc, data, code)


def _error_body(exc, data, code):
    if isinstance(exc, exceptions.ValidationError):
        details = data if isinstance(data, dict) else {api_settings.NON_FIELD_ERRORS_KEY: data}
        # S'il n'y a qu'une erreur globale (ex. « dernier propriétaire »), elle sert de message.
        non_field = details.get(api_settings.NON_FIELD_ERRORS_KEY, [])
        message = non_field[0] if len(details) == 1 and len(non_field) == 1 else VALIDATION_MESSAGE
        return {"code": code or "validation_error", "message": str(message), "details": details}

    # Les autres APIException donnent {"detail": "…"}. SimpleJWT ajoute aussi "code" et "messages".
    details = dict(data) if isinstance(data, dict) else {"detail": data}
    message = details.pop("detail", "")
    code = details.pop("code", None) or getattr(exc.detail, "code", None) or exc.default_code
    return {"code": str(code), "message": str(message), "details": details}
