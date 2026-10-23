"""Configuration de Gunicorn, lue automatiquement depuis le répertoire courant.

Le nombre de processus se règle avec WEB_CONCURRENCY (lue par Gunicorn lui-même).
"""

import os

# Dans le conteneur : toutes les interfaces, le port étant publié par Docker.
bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:8000")  # noqa: S104
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
timeout = 30
# Pas de socket de contrôle (gunicornc, Gunicorn 25.1+) : il serait créé dans $HOME,
# que l'utilisateur du conteneur n'a pas.
control_socket_disable = True
# Messages de Gunicorn (démarrage, processus) en JSON sur la sortie standard, lue par
# docker logs, comme ceux de Django. Pas de journal d'accès Gunicorn : RequestIdMiddleware
# journalise déjà chaque requête, avec son identifiant, son utilisateur et sa durée.
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
