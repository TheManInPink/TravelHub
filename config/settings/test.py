"""Paramètres utilisés par pytest (base PostgreSQL de test créée automatiquement)."""

from .base import *  # noqa: F403

DEBUG = False
ALLOWED_HOSTS = ["testserver", "localhost"]

# Hachage rapide : les tests créent beaucoup d'utilisateurs.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Comme en production ; les tests qui en ont besoin les activent avec override_settings.
GRAPHQL_GRAPHIQL = False
GRAPHQL_INTROSPECTION = False
