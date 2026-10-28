"""
Paramètres communs à tous les environnements de TravelHub.

Les valeurs sensibles (clé secrète, accès à la base, hôtes autorisés) ne sont jamais
écrites ici. Elles sont lues dans les variables d'environnement ou dans le fichier .env.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
    CORS_ALLOWED_ORIGINS=(list, []),
    DB_CONN_MAX_AGE=(int, 60),
)
# Les variables déjà définies dans l'environnement ont priorité sur le fichier .env.
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")


# Applications

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
    "graphene_django",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.trips",
    "apps.itinerary",
    "apps.integrations",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    # En premier, pour que les redirections HTTPS aient aussi un identifiant de requête.
    "apps.core.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # CorsMiddleware doit précéder CommonMiddleware.
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


# Base de données PostgreSQL, configurée par DATABASE_URL
# (ex. postgres://travelhub:motdepasse@localhost:5432/travelhub)

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["CONN_MAX_AGE"] = env("DB_CONN_MAX_AGE")
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True


# Authentification

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalisation

LANGUAGE_CODE = "fr-ca"
TIME_ZONE = "America/Toronto"
USE_I18N = True
USE_TZ = True


# Fichiers statiques (admin, Swagger UI, GraphiQL)

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# CORS : on accepte seulement les origines de CORS_ALLOWED_ORIGINS.

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
# Le front-end peut lire l'identifiant de requête (à citer en cas d'erreur).
CORS_EXPOSE_HEADERS = ["X-Request-ID"]


# Django REST Framework. Tout est privé par défaut, et les vues publiques doivent
# le déclarer.

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "apps.core.filters.StableOrderingFilter",
    ],
    # Les compteurs de throttling vivent dans le cache par défaut.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON_RATE", default="100/hour"),
        "user": env("THROTTLE_USER_RATE", default="1000/hour"),
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Enveloppe {"error": {"code", "message", "details"}} pour toutes les erreurs.
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
}


# JWT (SimpleJWT). Le jeton d'accès dure peu de temps et le jeton de rafraîchissement
# ne sert qu'une fois.

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    # Chaque rafraîchissement émet un nouveau refresh et met l'ancien sur liste noire.
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}


# Documentation OpenAPI (drf-spectacular) : /api/schema/, /api/docs/, /api/redoc/

SPECTACULAR_SETTINGS = {
    "TITLE": "TravelHub API",
    "DESCRIPTION": (
        "API REST de planification de voyages. Obtenez un jeton avec "
        "`POST /api/auth/token/`, puis cliquez sur « Authorize » et collez le jeton "
        "d'accès (sans le préfixe Bearer)."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # Schémas séparés pour la lecture et l'écriture, pour que les champs calculés
    # n'apparaissent pas dans les corps de requête.
    "COMPONENT_SPLIT_REQUEST": True,
    "SWAGGER_UI_SETTINGS": {"persistAuthorization": True},
    # Il y a deux champs « role » avec des choix différents, donc on nomme chaque énumération.
    "ENUM_NAME_OVERRIDES": {
        "ParticipantRoleEnum": "apps.trips.models.ParticipantRole",
        "InvitableRoleEnum": "apps.trips.serializers.INVITABLE_ROLES",
    },
}


# API GraphQL (Graphene-Django) : /graphql/, authentifiée par JWT comme l'API REST.

GRAPHENE = {
    "SCHEMA": "config.schema.schema",
    "TESTING_ENDPOINT": "/graphql/",
    # Pas de DjangoDebugMiddleware (ajouté par défaut si DEBUG), donc pas de champ _debug
    # dans le schéma.
    "MIDDLEWARE": [],
}
# Profondeur maximale d'une requête. Ça bloque les requêtes cycliques
# (trip { destinations { trip { destinations … } } }).
GRAPHQL_MAX_DEPTH = 6
# L'interface GraphiQL et l'introspection du schéma ne sont ouvertes qu'en développement.
GRAPHQL_GRAPHIQL = DEBUG
GRAPHQL_INTROSPECTION = DEBUG


# Journaux en JSON, une ligne par événement (apps.core.logs). Ils vont sur la console
# et dans un fichier rotatif (LOG_FILE, 10 Mo et 5 archives). Si LOG_FILE est vide,
# on écrit seulement sur la console. Chaque ligne a le request_id de la requête en cours.

LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOG_FILE = env("LOG_FILE", default=str(BASE_DIR / "logs" / "travelhub.log"))
if LOG_FILE:
    Path(LOG_FILE).parent.mkdir(parents=True, exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "apps.core.logs.RequestIdFilter"}},
    "formatters": {"json": {"()": "apps.core.logs.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_id"],
        },
        **(
            {
                "file": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "filename": LOG_FILE,
                    "maxBytes": 10 * 1024 * 1024,
                    "backupCount": 5,
                    "encoding": "utf-8",
                    # Fichier ouvert seulement au premier message (collectstatic, check…).
                    "delay": True,
                    "formatter": "json",
                    "filters": ["request_id"],
                }
            }
            if LOG_FILE
            else {}
        ),
    },
    "root": {"handlers": ["console", "file"] if LOG_FILE else ["console"], "level": LOG_LEVEL},
    "loggers": {
        # On retire les gestionnaires par défaut de Django (texte, courriel aux ADMINS) et
        # tout remonte à la racine. django.request journalise les 4xx et les 500 avec la
        # trace. Le client, lui, ne voit jamais cette trace (apps.core.views.server_error).
        "django": {
            "handlers": [],
            "level": env("DJANGO_LOG_LEVEL", default="INFO"),
            "propagate": True,
        },
        # runserver : RequestIdMiddleware journalise déjà chaque requête.
        "django.server": {"handlers": [], "level": "WARNING", "propagate": True},
        # Les requêtes SQL (en DEBUG) font trop de bruit pour la racine.
        "django.db.backends": {"level": "INFO"},
    },
}
