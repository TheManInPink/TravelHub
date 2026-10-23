"""Journaux JSON de TravelHub : une ligne JSON par événement, avec l'identifiant de requête.

- request_id_var : identifiant de la requête HTTP en cours (RequestIdMiddleware). Une
  variable de contexte : chaque fil et chaque tâche asyncio a la sienne. Les fils d'un
  ThreadPoolExecutor ne l'héritent pas : soumettre contextvars.copy_context().run ;
- RequestIdFilter : ajoute request_id à chaque enregistrement ;
- JsonFormatter : horodatage UTC, niveau, logger, message, request_id, champs passés dans
  extra= (valeurs JSON simples seulement), trace de l'exception.

Aucun secret dans les journaux : les champs extra dont le nom évoque un secret (password,
token, authorization, cookie…) sont masqués, comme les JWT et les en-têtes Bearer
présents dans les messages et les traces. Ce masquage est un filet de sécurité : le code
ne journalise de toute façon ni corps de requête, ni en-têtes, ni chaîne de requête.

Ce module n'importe pas Django : gunicorn.conf.py l'utilise avant le chargement de l'application.
"""

import contextvars
import datetime
import json
import logging
import re

request_id_var = contextvars.ContextVar("request_id", default=None)

REDACTED = "[masqué]"
SENSITIVE_KEY = re.compile(
    r"pass(word|wd)?|token|secret|authorization|cookie|api_?key|session|csrf|refresh|access",
    re.IGNORECASE,
)
SENSITIVE_TEXT = (
    # JWT : trois segments base64url, le premier étant un en-tête JSON ({" → eyJ).
    re.compile(r"eyJ[\w-]+\.[\w-]+\.[\w-]*"),
    re.compile(r"(?i)\bBearer\s+\S+"),
)

# Attributs propres à tout LogRecord : le reste vient de extra=.
STANDARD_ATTRIBUTES = frozenset(logging.makeLogRecord({}).__dict__) | {
    "message",
    "asctime",
    "request_id",
}
SIMPLE_TYPES = (str, int, float, bool, type(None))
SKIP = object()


def get_request_id():
    return request_id_var.get()


def redact_text(text):
    for pattern in SENSITIVE_TEXT:
        text = pattern.sub(REDACTED, text)
    return text


def redact(key, value):
    """Valeur JSON d'un champ extra, masquée si son nom évoque un secret ; SKIP si
    la valeur n'est pas une donnée JSON simple (objet requête, réponse…)."""
    if SENSITIVE_KEY.search(key):
        return REDACTED
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, SIMPLE_TYPES):
        return value
    if isinstance(value, dict):
        items = ((str(k), redact(str(k), v)) for k, v in value.items())
        return {k: v for k, v in items if v is not SKIP}
    if isinstance(value, list | tuple):
        return [redact(key, item) for item in value if isinstance(item, SIMPLE_TYPES)]
    return SKIP


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = get_request_id()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record):
        entry = {
            "timestamp": datetime.datetime.fromtimestamp(record.created, datetime.UTC).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
            "request_id": getattr(record, "request_id", None),
        }
        for key, value in record.__dict__.items():
            if key in STANDARD_ATTRIBUTES or key.startswith("_"):
                continue
            value = redact(key, value)
            if value is not SKIP:
                entry[key] = value
        if record.exc_info:
            entry["exception"] = redact_text(self.formatException(record.exc_info))
        if record.stack_info:
            entry["stack"] = redact_text(self.formatStack(record.stack_info))
        return json.dumps(entry, ensure_ascii=False, default=str)
