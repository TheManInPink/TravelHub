"""Point d'entrée de l'API GraphQL (/graphql/), contrôle de santé (/health/) et
réponses d'erreur hors DRF.

not_found et server_error remplacent les pages HTML de Django (handler404, handler500
dans config/urls.py) quand DEBUG vaut False : une URL inconnue ou une erreur inattendue
renvoie aussi l'enveloppe {"error": {...}}, sans trace de pile.
"""

import logging
import uuid

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_safe
from graphene.utils.str_converters import to_camel_case
from graphene.validation import depth_limit_validator
from graphene_django.views import GraphQLView
from graphql import GraphQLError, specified_rules
from graphql.validation import ValidationRule
from rest_framework.exceptions import AuthenticationFailed, NotFound, Throttled
from rest_framework.settings import api_settings
from rest_framework_simplejwt.authentication import JWTAuthentication

from .exceptions import error_body

logger = logging.getLogger(__name__)

INTERNAL_ERROR = {
    "code": "internal_error",
    "message": "Une erreur interne est survenue.",
    "details": {},
}


def not_found(request, exception=None):
    """handler404 : URL inconnue (les vues DRF produisent elles-mêmes leurs 404)."""
    body = {"code": NotFound.default_code, "message": str(NotFound.default_detail), "details": {}}
    return JsonResponse({"error": body}, status=404)


def server_error(request):
    """handler500 : l'exception est journalisée par Django, le client n'en voit rien."""
    return JsonResponse({"error": INTERNAL_ERROR}, status=500)


@never_cache
@require_safe
def health(request):
    """Contrôle de santé de Docker : base de données et cache.

    Vue Django simple, hors DRF : ni authentification ni throttling. 200 si tout répond,
    503 sinon ; la cause n'est pas divulguée, elle est journalisée.
    """
    checks = {"database": check_database(), "cache": check_cache()}
    healthy = all(result == "ok" for result in checks.values())
    body = {"status": "ok" if healthy else "error", "checks": checks}
    return JsonResponse(body, status=200 if healthy else 503)


def check_database():
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        logger.exception("Contrôle de santé : base de données injoignable")
        return "error"
    return "ok"


def check_cache():
    key = f"health:{uuid.uuid4().hex}"
    try:
        cache.set(key, "ok", timeout=10)
        ok = cache.get(key) == "ok"
        cache.delete(key)
    except Exception:  # chaque backend (Redis, Memcached…) a ses propres exceptions
        logger.exception("Contrôle de santé : cache injoignable")
        return "error"
    if not ok:
        logger.error("Contrôle de santé : le cache ne restitue pas la valeur écrite")
        return "error"
    return "ok"


class DisableIntrospection(ValidationRule):
    """Refuse __schema et __type, sans toucher à __typename.

    La règle de graphene refuse tout champ commençant par « __ », __typename compris,
    que les clients comme Apollo ajoutent à chaque requête.
    """

    def enter_field(self, node, *_args):
        name = node.name.value
        if name in ("__schema", "__type"):
            self.report_error(
                GraphQLError(f"Introspection désactivée : {name} n'est pas disponible.", node)
            )


# Exempt de CSRF : seul l'en-tête Authorization authentifie, jamais le cookie de session.
@method_decorator(csrf_exempt, name="dispatch")
class TravelHubGraphQLView(GraphQLView):
    """GraphQLView authentifiée par JWT, comme l'API REST.

    - Authorization: Bearer <access> identifie l'utilisateur ; sans en-tête, la requête
      est anonyme et les resolvers répondent not_authenticated. Un jeton invalide ou
      expiré donne un 401, comme côté REST.
    - Les limites de requêtes de l'API REST (DEFAULT_THROTTLE_CLASSES) s'appliquent avec
      les mêmes compteurs : un utilisateur partage un seul quota entre REST et GraphQL.
      Au-delà, 429 et en-tête Retry-After.
    - Les erreurs des resolvers gardent le code et les détails de l'erreur REST
      équivalente dans extensions ; une erreur inattendue ne divulgue pas son message.
    - GRAPHQL_GRAPHIQL et GRAPHQL_INTROSPECTION (activés en développement seulement) et
      GRAPHQL_MAX_DEPTH sont relus à chaque requête.
    """

    authentication = JWTAuthentication()

    def dispatch(self, request, *args, **kwargs):
        try:
            request.user = self.authenticate(request)
            self.check_throttles(request)
        except AuthenticationFailed as exc:  # InvalidToken en hérite
            response = self.error_response(exc)
            response["WWW-Authenticate"] = self.authentication.authenticate_header(request)
            return response
        except Throttled as exc:
            response = self.error_response(exc)
            if exc.wait is not None:
                response["Retry-After"] = str(exc.wait)
            return response
        self.graphiql = settings.GRAPHQL_GRAPHIQL
        self.validation_rules = self.get_validation_rules()
        return super().dispatch(request, *args, **kwargs)

    def authenticate(self, request):
        # Remplace l'utilisateur de la session (AuthenticationMiddleware) : un cookie seul
        # ne doit pas authentifier une requête exemptée de CSRF.
        result = self.authentication.authenticate(request)
        return result[0] if result else AnonymousUser()

    def check_throttles(self, request):
        """Lève Throttled si une limite est atteinte, comme APIView.check_throttles()."""
        throttles = [throttle_class() for throttle_class in api_settings.DEFAULT_THROTTLE_CLASSES]
        # Chaque limite est consultée : allow_request() n'enregistre que les requêtes admises.
        waits = [
            throttle.wait() for throttle in throttles if not throttle.allow_request(request, self)
        ]
        if waits:
            raise Throttled(max((wait for wait in waits if wait is not None), default=None))

    @classmethod
    def error_response(cls, exc):
        """Réponse HTTP d'erreur, hors exécution GraphQL (jeton invalide, limite atteinte)."""
        body = {"errors": [cls.error_from_body(error_body(exc))]}
        return JsonResponse(body, status=exc.status_code)

    @staticmethod
    def get_validation_rules():
        rules = [*specified_rules, depth_limit_validator(max_depth=settings.GRAPHQL_MAX_DEPTH)]
        if not settings.GRAPHQL_INTROSPECTION:
            rules.append(DisableIntrospection)
        return rules

    @classmethod
    def format_error(cls, error):
        formatted = GraphQLView.format_error(error)
        original = getattr(error, "original_error", None)
        # Sans chemin, l'erreur concerne le document ou les variables (syntaxe, type,
        # profondeur) : le message de graphql-core est déjà destiné au client.
        if original is None or not getattr(error, "path", None):
            return formatted
        body = error_body(original)
        if body is None:
            logger.error("Erreur inattendue dans un resolver GraphQL", exc_info=original)
            body = INTERNAL_ERROR
        return {**formatted, **cls.error_from_body(body)}

    @staticmethod
    def error_from_body(body):
        """Erreur GraphQL tirée du corps {"code", "message", "details"} de l'API REST.

        Les noms de champ des détails passent en camelCase, comme dans le schéma.
        """
        details = {to_camel_case(field): errors for field, errors in body["details"].items()}
        return {
            "message": body["message"],
            "extensions": {"code": body["code"], "details": details},
        }
