"""Configuration de sécurité : en-têtes HTTP, CORS, jetons JWT, paramètres de production
et absence de trace de pile dans les réponses d'erreur."""

import importlib
import os
import subprocess
import sys
from datetime import timedelta

import pytest
from django.conf import settings
from django.test import override_settings
from django.urls import reverse
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

    def test_no_wildcard_and_no_credentials(self):
        assert not getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
        assert not getattr(settings, "CORS_ALLOW_CREDENTIALS", False)
        assert not getattr(settings, "CORS_ALLOWED_ORIGIN_REGEXES", [])
        assert "*" not in settings.CORS_ALLOWED_ORIGINS


@pytest.mark.django_db
class TestJwt:
    def test_short_lived_rotated_tokens(self):
        jwt = settings.SIMPLE_JWT
        assert jwt["ACCESS_TOKEN_LIFETIME"] <= timedelta(minutes=15)
        assert jwt["ROTATE_REFRESH_TOKENS"] and jwt["BLACKLIST_AFTER_ROTATION"]

    def test_tampered_token_is_refused(self, api_client, user_a, user_b):
        """Remplacer user_id dans la charge utile invalide la signature : pas d'usurpation."""
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
        # L'erreur reste visible côté serveur, dans les journaux.
        assert "secret interne" in caplog.text

    def test_debug_is_off_in_tests_like_in_production(self):
        assert settings.DEBUG is False


def load_settings(module):
    """Module de paramètres importé à part : django.conf.settings n'est pas modifié."""
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

    def test_errors_are_logged_to_the_console(self, prod):
        assert prod.LOGGING["root"]["handlers"] == ["console"]

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
