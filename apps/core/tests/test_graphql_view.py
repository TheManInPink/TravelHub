"""Tests de TravelHubGraphQLView (authentification JWT, format des erreurs, durcissement)."""

import pytest
from django.test import Client
from django.urls import reverse
from graphene_django.utils.testing import graphql_query
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from apps.core.testing import graphql_codes, graphql_data
from apps.trips.models import TripQuerySet

ME = "query { me { username email } }"


@pytest.mark.django_db
class TestAuthentication:
    def test_bearer_token_authenticates(self, graphql, owner):
        response = graphql(ME, user=owner)

        assert response.status_code == 200
        assert graphql_data(response) == {"me": {"username": "owner", "email": "owner@example.com"}}

    def test_anonymous_gets_not_authenticated(self, graphql):
        response = graphql(ME)

        assert response.status_code == 200
        body = response.json()
        assert body["data"] == {"me": None}
        assert body["errors"][0]["path"] == ["me"]
        assert graphql_codes(response) == ["not_authenticated"]

    def test_invalid_token_gives_401(self, graphql):
        response = graphql(ME, token="pas-un-jeton")

        assert response.status_code == 401
        assert response["WWW-Authenticate"].startswith("Bearer")
        assert graphql_codes(response) == ["token_not_valid"]

    def test_session_cookie_does_not_authenticate(self, client, graphql, owner):
        # La vue est exemptée de CSRF, donc seul le jeton doit compter.
        client.force_login(owner)

        assert graphql_codes(graphql(ME)) == ["not_authenticated"]

    def test_csrf_is_not_required_with_a_token(self, owner):
        response = graphql_query(
            ME,
            headers={"Authorization": f"Bearer {AccessToken.for_user(owner)}"},
            client=Client(enforce_csrf_checks=True),
            graphql_url=reverse("graphql"),
        )

        assert response.status_code == 200
        assert graphql_data(response)["me"]["username"] == "owner"


@pytest.mark.django_db
class TestErrors:
    def test_unexpected_error_is_hidden(self, graphql, owner, monkeypatch, caplog):
        def broken(self, user):
            raise RuntimeError("détail interne secret")

        monkeypatch.setattr(TripQuerySet, "visible_to", broken)

        response = graphql("query { myTrips { id } }", user=owner)

        error = response.json()["errors"][0]
        assert error["extensions"]["code"] == "internal_error"
        assert error["message"] == "Une erreur interne est survenue."
        assert "secret" not in response.content.decode()
        assert "détail interne secret" in caplog.text  # mais journalisé côté serveur

    def test_syntax_error_gives_400(self, graphql, owner):
        response = graphql("query { me { username }", user=owner)

        assert response.status_code == 400
        assert "Syntax Error" in response.json()["errors"][0]["message"]

    def test_unknown_field_gives_400(self, graphql, owner):
        response = graphql("query { me { password } }", user=owner)

        assert response.status_code == 400
        assert "Cannot query field 'password'" in response.json()["errors"][0]["message"]


@pytest.mark.django_db
class TestThrottling:
    # Les classes de throttling lisent leurs taux à l'import, donc on les remplace directement.
    def test_anonymous_requests_are_throttled(self, graphql, monkeypatch):
        monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "2/minute"})

        assert [graphql(ME).status_code for _ in range(2)] == [200, 200]
        response = graphql(ME)

        assert response.status_code == 429
        assert int(response["Retry-After"]) > 0
        assert graphql_codes(response) == ["throttled"]

    def test_quota_is_shared_with_the_rest_api(self, graphql, client_for, owner, monkeypatch):
        monkeypatch.setattr(UserRateThrottle, "THROTTLE_RATES", {"user": "2/minute"})

        assert client_for(owner).get(reverse("auth:me")).status_code == 200
        assert graphql(ME, user=owner).status_code == 200
        response = graphql(ME, user=owner)

        assert response.status_code == 429
        assert graphql_codes(response) == ["throttled"]
        assert client_for(owner).get(reverse("auth:me")).status_code == 429


INTROSPECTION = "query { __schema { queryType { name } } }"


@pytest.mark.django_db
class TestHardening:
    def test_introspection_disabled_outside_development(self, graphql, owner):
        response = graphql(INTROSPECTION, user=owner)

        assert response.status_code == 400
        assert response.json()["errors"][0]["message"] == (
            "Introspection désactivée : __schema n'est pas disponible."
        )

    def test_introspection_enabled_in_development(self, graphql, owner, settings):
        settings.GRAPHQL_INTROSPECTION = True

        response = graphql(INTROSPECTION, user=owner)

        assert graphql_data(response) == {"__schema": {"queryType": {"name": "Query"}}}

    def test_typename_stays_available(self, graphql, owner):
        # Apollo Client ajoute __typename à chaque sélection.
        response = graphql("query { me { __typename username } }", user=owner)

        assert graphql_data(response) == {"me": {"__typename": "User", "username": "owner"}}

    def test_depth_limit_accepts_six_levels(self, graphql, owner, settings):
        assert settings.GRAPHQL_MAX_DEPTH == 6
        query = """
        query Six { myTrips { destinations { activities { destination { trip { owner {
          username
        } } } } } } }
        """

        assert graphql_data(graphql(query, user=owner)) == {"myTrips": []}

    def test_depth_limit_rejects_cyclic_queries(self, graphql, owner):
        query = """
        query Cycle { myTrips { destinations { trip { destinations { trip { destinations {
          trip { title }
        } } } } } } }
        """

        response = graphql(query, user=owner)

        assert response.status_code == 400
        assert response.json()["errors"][0]["message"] == (
            "'Cycle' exceeds maximum operation depth of 6."
        )

    def test_graphiql_in_development(self, client, settings):
        settings.GRAPHQL_GRAPHIQL = True

        response = client.get(reverse("graphql"), headers={"Accept": "text/html"})

        assert response.status_code == 200
        assert b"graphiql" in response.content.lower()

    def test_no_graphiql_outside_development(self, client):
        response = client.get(reverse("graphql"), headers={"Accept": "text/html"})

        assert response.status_code == 400
        assert b"graphiql" not in response.content.lower()
