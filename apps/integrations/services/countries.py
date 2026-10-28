"""Client Countries GraphQL (https://countries.trevorblades.com/graphql), sans clé d'API.

get_country() envoie une requête GraphQL avec des variables. Le code pays est passé
dans « variables » et n'est jamais collé dans le texte de la requête. Le résultat est
gardé 24 heures en cache.

Un serveur GraphQL répond 200 même quand il y a une erreur. On regarde donc la liste
« errors » avant « data ». Si elle n'est pas vide, on lève ExternalServiceBadResponse
(502). Pour un code inconnu, la réponse est {"data": {"country": null}} et on lève
CountryNotFound. Pour le délai, le nouvel essai et le cache, voir
apps.integrations.services.http.
"""

import logging
from dataclasses import dataclass

from apps.integrations.exceptions import CountryNotFound, ExternalServiceBadResponse

from .http import cached, new_session, request_json

logger = logging.getLogger(__name__)

SERVICE = "Countries GraphQL"
GRAPHQL_URL = "https://countries.trevorblades.com/graphql"
CACHE_SECONDS = 24 * 60 * 60

COUNTRY_QUERY = """
query Country($code: ID!) {
  country(code: $code) {
    code
    name
    native
    capital
    emoji
    currency
    continent { name }
    languages { name native }
  }
}
"""

session = new_session()


@dataclass(frozen=True, slots=True)
class Language:
    name: str
    native: str


@dataclass(frozen=True, slots=True)
class Country:
    code: str
    name: str  # en anglais, le service ne traduit pas
    native: str
    capital: str | None
    emoji: str
    currency: str | None  # codes ISO 4217 séparés par des virgules, ex. « USD,USN,USS »
    continent: str
    languages: tuple[Language, ...]

    @property
    def currencies(self):
        return [code for code in (self.currency or "").split(",") if code]


def get_country(code):
    """Pays dont le code ISO 3166-1 alpha-2 est code. Lève CountryNotFound s'il n'existe pas."""
    code = code.strip().upper()
    body = {"query": COUNTRY_QUERY, "variables": {"code": code}}

    def parse(payload):
        if payload.get("errors"):
            messages = "; ".join(str(error.get("message")) for error in payload["errors"])
            logger.error("%s a renvoyé des erreurs pour %s : %s", SERVICE, code, messages)
            raise ExternalServiceBadResponse(f"{SERVICE} a renvoyé une erreur : {messages}")
        country = payload["data"]["country"]
        if country is None:
            raise CountryNotFound(f"Pays introuvable : {code} n'est pas un code pays connu.")
        return Country(
            code=country["code"],
            name=country["name"],
            native=country["native"],
            capital=country["capital"],
            emoji=country["emoji"],
            currency=country["currency"],
            continent=country["continent"]["name"],
            languages=tuple(
                Language(name=language["name"], native=language["native"])
                for language in country["languages"]
            ),
        )

    return cached(
        SERVICE,
        f"countries:country:{code}",
        CACHE_SECONDS,
        lambda: request_json(session, SERVICE, "POST", GRAPHQL_URL, json=body),
        parse,
    )
