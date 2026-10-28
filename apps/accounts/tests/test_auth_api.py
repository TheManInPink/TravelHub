from datetime import timedelta

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

PASSWORD = "pw-Secret-123"

REGISTER_URL = reverse("auth:register")
TOKEN_URL = reverse("auth:token")
REFRESH_URL = reverse("auth:token-refresh")
LOGOUT_URL = reverse("auth:logout")
ME_URL = reverse("auth:me")


def obtain_tokens(client, username):
    response = client.post(TOKEN_URL, {"username": username, "password": PASSWORD})
    assert response.status_code == 200, response.data
    return response.data


def bearer(client, access):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


def test_jwt_lifetimes_and_rotation():
    jwt = settings.SIMPLE_JWT
    assert jwt["ACCESS_TOKEN_LIFETIME"] == timedelta(minutes=15)
    assert jwt["REFRESH_TOKEN_LIFETIME"] == timedelta(days=1)
    assert jwt["ROTATE_REFRESH_TOKENS"] is True
    assert jwt["BLACKLIST_AFTER_ROTATION"] is True


@pytest.mark.django_db
class TestRegister:
    payload = {
        "username": "alice",
        "email": "Alice@Example.com",
        "password": "Voyage-Montreal-2027",
        "first_name": "Alice",
    }

    def test_creates_user_and_returns_working_tokens(self, api_client):
        response = api_client.post(REGISTER_URL, self.payload)

        assert response.status_code == 201
        assert response.data["user"]["username"] == "alice"
        assert response.data["user"]["email"] == "alice@example.com"
        assert "password" not in response.data["user"]
        user = get_user_model().objects.get(username="alice")
        assert user.check_password("Voyage-Montreal-2027")

        me = bearer(api_client, response.data["tokens"]["access"]).get(ME_URL)
        assert me.status_code == 200
        assert me.data["id"] == user.pk

    def test_rejects_email_already_used_regardless_of_case(self, api_client):
        get_user_model().objects.create_user("bob", email="alice@example.com", password=PASSWORD)

        response = api_client.post(REGISTER_URL, self.payload)

        assert response.status_code == 400
        assert "email" in response.data["error"]["details"]

    def test_rejects_duplicate_username(self, api_client, make_user):
        make_user("alice")
        response = api_client.post(REGISTER_URL, {**self.payload, "email": "autre@example.com"})
        assert response.status_code == 400
        assert "username" in response.data["error"]["details"]

    @pytest.mark.parametrize("password", ["123", "password", "alice2027"])
    def test_rejects_weak_password(self, api_client, password):
        response = api_client.post(REGISTER_URL, {**self.payload, "password": password})
        assert response.status_code == 400
        assert "password" in response.data["error"]["details"]
        assert not get_user_model().objects.filter(username="alice").exists()

    def test_requires_email(self, api_client):
        response = api_client.post(REGISTER_URL, {**self.payload, "email": ""})
        assert response.status_code == 400
        assert "email" in response.data["error"]["details"]


@pytest.mark.django_db
class TestToken:
    def test_valid_credentials_return_token_pair(self, api_client, owner):
        tokens = obtain_tokens(api_client, "owner")
        assert set(tokens) == {"access", "refresh"}

    def test_wrong_password_is_rejected(self, api_client, owner):
        response = api_client.post(TOKEN_URL, {"username": "owner", "password": "mauvais"})
        assert response.status_code == 401

    def test_inactive_user_is_rejected(self, api_client, make_user):
        make_user("ghost", is_active=False)
        response = api_client.post(TOKEN_URL, {"username": "ghost", "password": PASSWORD})
        assert response.status_code == 401

    def test_refresh_rotates_and_blacklists_previous_token(self, api_client, owner):
        first = obtain_tokens(api_client, "owner")

        rotated = api_client.post(REFRESH_URL, {"refresh": first["refresh"]})
        assert rotated.status_code == 200
        assert rotated.data["refresh"] != first["refresh"]
        assert bearer(api_client, rotated.data["access"]).get(ME_URL).status_code == 200

        reused = api_client.post(REFRESH_URL, {"refresh": first["refresh"]})
        assert reused.status_code == 401

    def test_garbage_refresh_is_rejected(self, api_client):
        assert api_client.post(REFRESH_URL, {"refresh": "pas-un-jwt"}).status_code == 401


@pytest.mark.django_db
class TestLogout:
    def test_blacklists_refresh_token(self, api_client, owner):
        tokens = obtain_tokens(api_client, "owner")

        response = bearer(api_client, tokens["access"]).post(
            LOGOUT_URL, {"refresh": tokens["refresh"]}
        )

        assert response.status_code == 204
        assert BlacklistedToken.objects.filter(token__user=owner).count() == 1
        assert api_client.post(REFRESH_URL, {"refresh": tokens["refresh"]}).status_code == 401

    def test_second_logout_with_same_token_fails(self, api_client, owner):
        tokens = obtain_tokens(api_client, "owner")
        bearer(api_client, tokens["access"])
        api_client.post(LOGOUT_URL, {"refresh": tokens["refresh"]})

        response = api_client.post(LOGOUT_URL, {"refresh": tokens["refresh"]})

        assert response.status_code == 400
        assert "refresh" in response.data["error"]["details"]

    def test_cannot_revoke_another_users_token(self, api_client, owner, make_user):
        make_user("bob")
        bob_tokens = obtain_tokens(api_client, "bob")
        owner_tokens = obtain_tokens(api_client, "owner")

        response = bearer(api_client, owner_tokens["access"]).post(
            LOGOUT_URL, {"refresh": bob_tokens["refresh"]}
        )

        assert response.status_code == 400
        assert not BlacklistedToken.objects.exists()

    def test_requires_authentication(self, api_client, owner):
        tokens = obtain_tokens(api_client, "owner")
        assert api_client.post(LOGOUT_URL, {"refresh": tokens["refresh"]}).status_code == 401


@pytest.mark.django_db
class TestMe:
    def test_returns_current_user(self, client_for, owner):
        response = client_for(owner).get(ME_URL)
        assert response.status_code == 200
        assert response.data["username"] == "owner"
        assert response.data["email"] == "owner@example.com"

    def test_anonymous_gets_401(self, api_client):
        assert api_client.get(ME_URL).status_code == 401

    def test_invalid_bearer_gets_401(self, api_client):
        assert bearer(api_client, "abc.def.ghi").get(ME_URL).status_code == 401


@pytest.mark.django_db
def test_anonymous_requests_are_throttled(api_client, owner, monkeypatch):
    # Les classes de throttling lisent leurs taux à l'import, donc on les remplace directement.
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "2/minute"})
    credentials = {"username": "owner", "password": PASSWORD}

    statuses = [api_client.post(TOKEN_URL, credentials).status_code for _ in range(3)]

    assert statuses == [200, 200, 429]
