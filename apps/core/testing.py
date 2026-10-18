"""Utilitaires partagés par les tests de l'API."""


def error_of(response):
    """Corps {"code", "message", "details"} d'une réponse d'erreur de l'API."""
    return response.json()["error"]
