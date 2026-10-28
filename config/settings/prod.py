"""
Paramètres de production.

Vérification : python manage.py check --deploy --settings=config.settings.prod
"""

from .base import *  # noqa: F403
from .base import MIDDLEWARE, REST_FRAMEWORK, env

DEBUG = False

# Les fichiers statiques sont servis par Gunicorn avec WhiteNoise, placé juste après
# SecurityMiddleware. collectstatic produit les noms hachés et les versions
# compressées (voir Dockerfile).
_after_security = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1
MIDDLEWARE = [
    *MIDDLEWARE[:_after_security],
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[_after_security:],
]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Derrière un proxy inverse (nginx, plateforme cloud) qui termine le HTTPS.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
# Le HEALTHCHECK de Docker interroge Gunicorn en HTTP, sans passer par le proxy.
SECURE_REDIRECT_EXEMPT = [r"^health/$"]
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

# Seulement du JSON en production, sans l'API navigable (formulaires HTML). On crée
# un nouveau dictionnaire, car celui de base.py est partagé avec les autres modules.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

# Pas de GraphiQL ni d'introspection, le schéma n'est pas publié en production.
GRAPHQL_GRAPHIQL = False
GRAPHQL_INTROSPECTION = False
