"""Utilitaires partagés par les tests des API REST et GraphQL."""


def error_of(response):
    """Corps {"code", "message", "details"} d'une réponse d'erreur de l'API."""
    return response.json()["error"]


def graphql_data(response):
    """Champ data d'une réponse GraphQL qui ne doit contenir aucune erreur."""
    body = response.json()
    if "errors" in body:
        raise AssertionError(f"Erreurs GraphQL inattendues : {body['errors']}")
    return body["data"]


def graphql_codes(response):
    """Codes (extensions.code) des erreurs d'une réponse GraphQL, dans l'ordre."""
    return [error.get("extensions", {}).get("code") for error in response.json()["errors"]]
