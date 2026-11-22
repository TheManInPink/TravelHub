"""Tests de la configuration de sécurité.

On vérifie les en-têtes HTTP, CORS, les jetons JWT, les réglages de production et
l'absence de trace de pile dans les réponses d'erreur."""

import importlib
import os
import re
import subprocess
import sys
from datetime import timedelta

import pytest
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIRequestFactory
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from apps.core.testing import error_of
from apps.core.views import INTERNAL_ERROR

ME_URL = reverse("auth:me")


@pytest.mark.django_db
class TestSecurityHeaders:
    def test_api_responses_carry_protective_headers(self, client_a):
        response = client_a.get(ME_URL)

        assert response["X-Frame-Options"] == "DENY"
        assert response["X-Content-Type-Options"] == "nosniff"
        assert response["Referrer-Policy"] == "same-origin"
        assert response["Cross-Origin-Opener-Policy"] == "same-origin"

    @override_settings(
        SECURE_HSTS_SECONDS=2592000, SECURE_HSTS_INCLUDE_SUBDOMAINS=True, SECURE_HSTS_PRELOAD=True
    )
    def test_hsts_on_https(self, client_a):
        response = client_a.get(ME_URL, secure=True)

        assert response["Strict-Transport-Security"] == (
            "max-age=2592000; includeSubDomains; preload"
        )

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_http_is_redirected_to_https(self, client_a):
        response = client_a.get(ME_URL)

        assert response.status_code == 301
        assert response["Location"].startswith("https://")


@pytest.mark.django_db
class TestCors:
    ALLOWED = "https://app.travelhub.example"

    def preflight(self, api_client, origin):
        return api_client.options(
            reverse("trip-list"),
            HTTP_ORIGIN=origin,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization, content-type",
        )

    @override_settings(CORS_ALLOWED_ORIGINS=[ALLOWED])
    def test_listed_origin_is_allowed(self, api_client):
        response = self.preflight(api_client, self.ALLOWED)

        assert response["Access-Control-Allow-Origin"] == self.ALLOWED
        assert "authorization" in response["Access-Control-Allow-Headers"]
        assert "Access-Control-Allow-Credentials" not in response

    @override_settings(CORS_ALLOWED_ORIGINS=[ALLOWED])
    def test_other_origins_are_refused(self, api_client):
        response = self.preflight(api_client, "https://evil.example")

        assert "Access-Control-Allow-Origin" not in response

    @override_settings(CORS_ALLOWED_ORIGINS=[ALLOWED])
    def test_request_id_and_retry_after_are_exposed(self, client_a):
        response = client_a.get(ME_URL, HTTP_ORIGIN=self.ALLOWED)

        exposed = {
            name.strip().lower() for name in response["Access-Control-Expose-Headers"].split(",")
        }
        assert {"x-request-id", "retry-after"} <= exposed

    @pytest.mark.parametrize(
        ("origin", "allowed"),
        [
            ("https://travelhub-git-frontend-auth-equipe.vercel.app", True),
            ("https://evil.vercel.app", False),
            ("https://travelhub-abc-equipe.vercel.app.evil.example", False),
        ],
    )
    @override_settings(
        CORS_ALLOWED_ORIGINS=[],
        CORS_ALLOWED_ORIGIN_REGEXES=[r"^https://travelhub-[a-z0-9-]+-equipe\.vercel\.app$"],
    )
    def test_preview_regex_accepts_only_team_previews(self, api_client, origin, allowed):
        response = self.preflight(api_client, origin)

        assert (response.get("Access-Control-Allow-Origin") == origin) is allowed

    def test_no_wildcard_and_no_credentials(self):
        assert not getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
        assert settings.CORS_ALLOW_CREDENTIALS is False
        assert "*" not in settings.CORS_ALLOWED_ORIGINS
        # Les regex des previews sont facultatives, mais toujours ancrées des deux côtés.
        for pattern in settings.CORS_ALLOWED_ORIGIN_REGEXES:
            assert pattern.startswith("^") and pattern.endswith("$"), pattern
            assert not re.match(pattern, "https://evil.vercel.app"), pattern


@pytest.fixture
def base_with_env(monkeypatch):
    """Recharge config.settings.base avec d'autres variables d'environnement.

    django.conf.settings ne change pas. Le module est rechargé une deuxième fois à la
    fin, avec l'environnement d'origine.
    """

    def _load(**variables):
        for name, value in variables.items():
            monkeypatch.setenv(name, value)
        return load_settings("config.settings.base")

    yield _load
    monkeypatch.undo()
    load_settings("config.settings.base")


class TestSettingsFromEnvironment:
    def test_preview_regexes_are_split_on_semicolons(self, base_with_env):
        # La virgule de {1,30} ne coupe pas la regex.
        base = base_with_env(
            CORS_ALLOWED_ORIGIN_REGEXES=(
                r"^https://travelhub-[a-z0-9-]{1,30}-equipe\.vercel\.app$ ; "
                r"^https://travelhub\.example$;"
            )
        )

        assert base.CORS_ALLOWED_ORIGIN_REGEXES == [
            r"^https://travelhub-[a-z0-9-]{1,30}-equipe\.vercel\.app$",
            r"^https://travelhub\.example$",
        ]

    def test_num_proxies_and_storage_host(self, base_with_env):
        base = base_with_env(NUM_PROXIES="1", SUPABASE_STORAGE_HOST="abcdefgh.supabase.co")

        assert base.REST_FRAMEWORK["NUM_PROXIES"] == 1
        assert base.SUPABASE_STORAGE_HOST == "abcdefgh.supabase.co"

    def test_storage_host_is_trimmed_and_lowercased(self, base_with_env):
        base = base_with_env(SUPABASE_STORAGE_HOST=" ABCDEFGH.supabase.co ")

        assert base.SUPABASE_STORAGE_HOST == "abcdefgh.supabase.co"

    @pytest.mark.parametrize(
        "value",
        ["https://abcdefgh.supabase.co", "abcdefgh.supabase.co/", "abcdefgh.supabase.co:443"],
    )
    def test_storage_host_must_be_a_bare_host(self, base_with_env, value):
        # Avec l'URL du projet, toutes les images seraient refusées. Django ne démarre pas.
        with pytest.raises(ImproperlyConfigured, match="SUPABASE_STORAGE_HOST"):
            base_with_env(SUPABASE_STORAGE_HOST=value)

    def test_throttling_uses_the_address_added_by_the_proxy(self):
        # Le client peut écrire ce qu'il veut dans X-Forwarded-For. Seule la dernière
        # adresse, ajoutée par le proxy de Render, est fiable.
        request = APIRequestFactory().get(
            "/", HTTP_X_FORWARDED_FOR="198.51.100.7, 203.0.113.9", REMOTE_ADDR="10.0.0.1"
        )

        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}):
            assert AnonRateThrottle().get_ident(request) == "203.0.113.9"


@pytest.mark.django_db
class TestJwt:
    def test_short_lived_rotated_tokens(self):
        jwt = settings.SIMPLE_JWT
        assert jwt["ACCESS_TOKEN_LIFETIME"] <= timedelta(minutes=15)
        assert jwt["ROTATE_REFRESH_TOKENS"] and jwt["BLACKLIST_AFTER_ROTATION"]

    def test_tampered_token_is_refused(self, api_client, user_a, user_b):
        """Si on change user_id dans la charge utile, la signature n'est plus valide."""
        header, _, signature = str(AccessToken.for_user(user_a)).split(".")
        forged = AccessToken.for_user(user_b)
        _, payload, _ = str(forged).split(".")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {header}.{payload}.{signature}")

        response = api_client.get(ME_URL)

        assert response.status_code == 401
        assert error_of(response)["code"] == "token_not_valid"

    def test_unsigned_token_is_refused(self, api_client, user_a):
        token = AccessToken.for_user(user_a)
        header = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"  # {"alg": "none", "typ": "JWT"}
        _, payload, _ = str(token).split(".")
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {header}.{payload}.")

        assert api_client.get(ME_URL).status_code == 401

    def test_expired_token_is_refused(self, api_client, user_a):
        token = AccessToken.for_user(user_a)
        token.set_exp(lifetime=-timedelta(seconds=1))
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        assert api_client.get(ME_URL).status_code == 401

    def test_refresh_token_cannot_be_used_as_access_token(self, api_client, user_a):
        response = api_client.post(
            reverse("auth:token"), {"username": "alice", "password": "pw-Secret-123"}
        )
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['refresh']}")

        assert api_client.get(ME_URL).status_code == 401


@pytest.mark.django_db
class TestNoStackTrace:
    def test_unexpected_error_gives_generic_json_500(self, client_a, trip_a, monkeypatch, caplog):
        def broken(trip):
            raise RuntimeError("secret interne : mot de passe de la base")

        monkeypatch.setattr("apps.trips.views.compute_trip_stats", broken)
        client_a.raise_request_exception = False

        response = client_a.get(reverse("trip-stats", args=[trip_a.pk]))

        assert response.status_code == 500
        assert response["Content-Type"] == "application/json"
        assert response.json() == {"error": INTERNAL_ERROR}
        body = response.content.decode()
        assert "secret interne" not in body and "Traceback" not in body
        # Côté serveur, l'erreur apparaît quand même dans les journaux.
        assert "secret interne" in caplog.text

    def test_debug_is_off_in_tests_like_in_production(self):
        assert settings.DEBUG is False


def load_settings(module):
    """On importe le module de paramètres à part pour ne pas modifier django.conf.settings."""
    return importlib.reload(importlib.import_module(module))


@pytest.fixture(scope="module")
def prod():
    return load_settings("config.settings.prod")


class TestProductionSettings:
    def test_https_and_cookies(self, prod):
        assert prod.DEBUG is False
        assert prod.SECURE_SSL_REDIRECT is True
        assert prod.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")
        assert prod.SECURE_HSTS_SECONDS >= 60 * 60 * 24 * 30
        assert prod.SECURE_HSTS_INCLUDE_SUBDOMAINS and prod.SECURE_HSTS_PRELOAD
        assert prod.SESSION_COOKIE_SECURE and prod.CSRF_COOKIE_SECURE
        assert prod.X_FRAME_OPTIONS == "DENY"
        assert prod.SECURE_CONTENT_TYPE_NOSNIFF

    def test_api_surface(self, prod):
        assert prod.REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] == [
            "rest_framework.renderers.JSONRenderer"
        ]
        assert prod.GRAPHQL_GRAPHIQL is False and prod.GRAPHQL_INTROSPECTION is False
        assert "PASSWORD_HASHERS" not in vars(prod)  # PBKDF2 de Django, pas le MD5 des tests

    def test_base_settings_are_not_modified(self, prod):
        assert "DEFAULT_RENDERER_CLASSES" not in settings.REST_FRAMEWORK

    def test_errors_are_logged_as_json(self, prod):
        assert "console" in prod.LOGGING["root"]["handlers"]
        assert prod.LOGGING["formatters"]["json"]["()"] == "apps.core.logs.JsonFormatter"
        assert prod.LOGGING["loggers"]["django"]["propagate"] is True

    def test_health_is_reachable_over_plain_http(self, prod):
        assert prod.SECURE_REDIRECT_EXEMPT == [r"^health/$"]

    def test_development_settings_follow_debug(self):
        dev = load_settings("config.settings.dev")
        assert dev.GRAPHQL_GRAPHIQL is dev.DEBUG
        assert dev.GRAPHQL_INTROSPECTION is dev.DEBUG

    @pytest.mark.slow
    def test_check_deploy_has_no_warning(self):
        env = {**os.environ, "DJANGO_SETTINGS_MODULE": "config.settings.prod"}
        result = subprocess.run(  # noqa: S603 : commande fixe, sans entrée externe
            [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
            cwd=settings.BASE_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )

        assert result.returncode == 0, result.stderr
        assert "no issues" in result.stdout
