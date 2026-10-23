"""
Paramètres de production.

Vérification : python manage.py check --deploy --settings=config.settings.prod
"""

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK, env

DEBUG = False

# Derrière un proxy inverse (nginx, plateforme cloud) qui termine le HTTPS.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

# JSON seulement : pas d'API navigable (formulaires HTML) en production. Nouveau
# dictionnaire : celui de base.py est partagé avec les autres modules de paramètres.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

# Ni GraphiQL ni introspection : le schéma n'est pas publié en production.
GRAPHQL_GRAPHIQL = False
GRAPHQL_INTROSPECTION = False

# Sans DEBUG, Django n'écrit les erreurs 500 nulle part (pas d'ADMINS) : on les envoie
# sur la sortie d'erreur, lue par le gestionnaire de processus. Le client, lui, ne reçoit
# que {"error": {"code": "internal_error", …}} (apps.core.views.server_error).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {"format": "{asctime} {levelname} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "standard"},
    },
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": env("DJANGO_LOG_LEVEL", default="INFO"),
            "propagate": False,
        },
    },
}
