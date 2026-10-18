"""Réponses d'erreur communes, réutilisées par les @extend_schema des vues."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse
from rest_framework import serializers


class ErrorDetailSerializer(serializers.Serializer):
    """Corps d'erreur par défaut de DRF."""

    detail = serializers.CharField()


def _error(description, message):
    return OpenApiResponse(
        response=ErrorDetailSerializer,
        description=description,
        examples=[OpenApiExample(description, value={"detail": message}, response_only=True)],
    )


VALIDATION_ERROR = OpenApiResponse(description="Données invalides : erreurs par champ.")
UNAUTHORIZED = _error("Non authentifié", "Informations d'authentification non fournies.")
FORBIDDEN = _error("Accès refusé", "Vous n'avez pas la permission d'effectuer cette action.")
NOT_FOUND = _error("Introuvable ou non visible", "No Trip matches the given query.")
THROTTLED = _error("Trop de requêtes", "La requête a été limitée.")
