"""Réponses d'erreur communes, réutilisées par les @extend_schema des vues.

Elles décrivent l'enveloppe produite par apps.core.exceptions.exception_handler.
"""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse
from rest_framework import serializers


class ApiErrorBodySerializer(serializers.Serializer):
    code = serializers.CharField(
        help_text="Identifiant stable : validation_error, not_found, permission_denied…"
    )
    message = serializers.CharField(help_text="Description lisible de l'erreur.")
    details = serializers.DictField(
        help_text="Erreurs par champ pour une validation (`non_field_errors` pour les "
        "erreurs globales), objet vide sinon."
    )


class ApiErrorSerializer(serializers.Serializer):
    """Corps de toutes les réponses d'erreur de l'API."""

    error = ApiErrorBodySerializer()


def error_body(code, message, details=None):
    return {"error": {"code": code, "message": message, "details": details or {}}}


def error_response(description, code, message, details=None):
    return OpenApiResponse(
        response=ApiErrorSerializer,
        description=description,
        examples=[
            OpenApiExample(
                description, value=error_body(code, message, details), response_only=True
            )
        ],
    )


VALIDATION_ERROR = error_response(
    "Données invalides : erreurs par champ",
    "validation_error",
    "Les données envoyées sont invalides.",
    {"title": ["Ce champ est obligatoire."]},
)
UNAUTHORIZED = error_response(
    "Non authentifié", "not_authenticated", "Informations d'authentification non fournies."
)
FORBIDDEN = error_response(
    "Accès refusé",
    "permission_denied",
    "Seuls le propriétaire et les éditeurs peuvent modifier ce voyage.",
)
NOT_FOUND = error_response("Introuvable ou non visible", "not_found", "Non trouvé.")
THROTTLED = error_response(
    "Trop de requêtes", "throttled", "Requête ralentie. Disponible à nouveau dans 42 secondes."
)
