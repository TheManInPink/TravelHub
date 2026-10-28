"""Configuration de Gunicorn, lue automatiquement dans le répertoire courant.

Le nombre de processus se règle avec WEB_CONCURRENCY, que Gunicorn lit lui-même.
"""

import os

# Dans le conteneur, on écoute sur toutes les interfaces. Docker publie le port.
bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:8000")  # noqa: S104
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
timeout = 30
# Pas de socket de contrôle (gunicornc, Gunicorn 25.1+). Il serait créé dans $HOME,
# et l'utilisateur du conteneur n'en a pas.
control_socket_disable = True
# Les messages de Gunicorn (démarrage, processus) sont écrits en JSON sur la sortie
# standard, comme ceux de Django, et docker logs les lit. Pas de journal d'accès
# Gunicorn, car RequestIdMiddleware journalise déjà chaque requête avec son
# identifiant, son utilisateur et sa durée.
logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": "apps.core.logs.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "stream": "ext://sys.stdout",
        },
    },
    "root": {"level": "INFO", "handlers": []},
    "loggers": {
        "gunicorn.error": {"level": "INFO", "handlers": ["console"], "propagate": False},
        "gunicorn.access": {"level": "WARNING", "handlers": [], "propagate": False},
    },
}
