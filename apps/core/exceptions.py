"""Gestionnaire d'exceptions global de l'API REST.

Toutes les erreurs ont la même forme :

    {"error": {"code": "validation_error", "message": "…", "details": {"end_date": ["…"]}}}

- code : identifiant stable, à tester côté client (validation_error, not_authenticated,
  permission_denied, not_found, integrity_error, throttled…) ;
- message : phrase lisible par un humain ;
- details : erreurs par champ pour une validation, objet vide sinon.

Les ValidationError de Django (levées par les services et Model.clean()) et les
IntegrityError (contrainte de base violée, par exemple par deux requêtes simultanées)
deviennent des 400 au lieu de 500. Les erreurs des services externes
(apps.integrations.exceptions) gardent leur statut (404, 503, 504) et leur code.
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
    """Erreurs d'une ValidationError Django au format DRF : {champ: [messages]}.

    La clé « __all__ » de Django devient « non_field_errors », comme dans les serializers.
    """
    detail = as_serializer_error(exc)
    if NON_FIELD_ERRORS in detail:
        detail.setdefault(api_settings.NON_FIELD_ERRORS_KEY, [])
        detail[api_settings.NON_FIELD_ERRORS_KEY] += detail.pop(NON_FIELD_ERRORS)
    return detail


@cache
def _constraint_messages():
    """Nom de contrainte -> message d'erreur, pour les contraintes déclarées dans les modèles."""
    return {
        constraint.name: constraint.get_violation_error_message()
        for model in apps.get_models()
        for constraint in model._meta.constraints
    }


def integrity_error_message(exc):
    """Message de la contrainte violée, retrouvé grâce au nom que remonte PostgreSQL."""
    diag = getattr(exc.__cause__, "diag", None)  # psycopg expose le diagnostic du serveur
    name = getattr(diag, "constraint_name", None)
    return _constraint_messages().get(name, INTEGRITY_MESSAGE)


def exception_handler(exc, context):
    """EXCEPTION_HANDLER de DRF : convertit, délègue à DRF, puis enveloppe la réponse."""
    code = None
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(django_error_detail(exc))
    elif isinstance(exc, IntegrityError):
        code = "integrity_error"
        exc = exceptions.ValidationError(
            {api_settings.NON_FIELD_ERRORS_KEY: [integrity_error_message(exc)]}
        )
    elif isinstance(exc, Http404):
        # Le message de get_object_or_404 est en anglais et nomme le modèle : on garde
        # le message générique traduit de DRF.
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied(*exc.args)
    elif isinstance(exc, IntegrationError):
        status_code = exc.status_code
        exc = exceptions.APIException(exc.message, code=exc.code)
        exc.status_code = status_code

    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # erreur inattendue : Django renvoie une 500
    response.data = {"error": _error_body(exc, response.data, code)}
    return response


def _error_body(exc, data, code):
    if isinstance(exc, exceptions.ValidationError):
        details = data if isinstance(data, dict) else {api_settings.NON_FIELD_ERRORS_KEY: data}
        # Une erreur unique et globale (« dernier propriétaire »…) sert directement de message.
        non_field = details.get(api_settings.NON_FIELD_ERRORS_KEY, [])
        message = non_field[0] if len(details) == 1 and len(non_field) == 1 else VALIDATION_MESSAGE
        return {"code": code or "validation_error", "message": str(message), "details": details}

    # Les autres APIException donnent {"detail": "…"} ; SimpleJWT y ajoute "code" et "messages".
    details = dict(data) if isinstance(data, dict) else {"detail": data}
    message = details.pop("detail", "")
    code = details.pop("code", None) or getattr(exc.detail, "code", None) or exc.default_code
    return {"code": str(code), "message": str(message), "details": details}
