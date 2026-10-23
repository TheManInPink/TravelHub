"""Configuration de Gunicorn, lue automatiquement depuis le répertoire courant.

Le nombre de processus se règle avec WEB_CONCURRENCY (lue par Gunicorn lui-même).
"""

import os

# Dans le conteneur : toutes les interfaces, le port étant publié par Docker.
bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:8000")  # noqa: S104
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
timeout = 30
# Journaux d'accès et d'erreurs sur la sortie standard, lue par docker logs.
accesslog = "-"
errorlog = "-"
