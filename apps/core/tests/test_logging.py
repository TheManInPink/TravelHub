"""Journaux JSON (apps.core.logs) et identifiant de requête (RequestIdMiddleware)."""

import io
import json
import logging
import sys
from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.core.logs import REDACTED, JsonFormatter, RequestIdFilter, request_id_var
from apps.integrations.services.countries import GRAPHQL_URL
from apps.integrations.services.open_meteo import FORECAST_URL
from apps.integrations.testing import country_payload, forecast_payload

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.c2lnbmF0dXJl"


def format_record(message="Bonjour %s", args=("Alice",), exc_info=None, **extra):
    record = logging.getLogger("travelhub.test").makeRecord(
        "travelhub.test", logging.INFO, __file__, 1, message, args, exc_info, extra=extra
    )
    RequestIdFilter().filter(record)
    return json.loads(JsonFormatter().format(record))


@pytest.fixture
def json_console():
    """Console JSON de production branchée sur la racine le temps du test."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdFilter())
    root = logging.getLogger()
    root.addHandler(handler)
    yield stream
    root.removeHandler(handler)


@pytest.fixture
def request_logs(caplog):
    """Enregistrements de la requête, avec le request_id ajouté comme en production."""
    caplog.handler.addFilter(RequestIdFilter())
    caplog.set_level(logging.INFO)
    return caplog


class TestJsonFormatter:
    def test_one_json_object_per_record(self):
        token = request_id_var.set("abc-123")
        try:
            entry = format_record(service="Open-Meteo", status=200, duration_ms=12.5)
        finally:
            request_id_var.reset(token)

        assert entry["level"] == "INFO"
        assert entry["logger"] == "travelhub.test"
        assert entry["message"] == "Bonjour Alice"
        assert entry["request_id"] == "abc-123"
        assert entry["timestamp"].endswith("+00:00")
        assert entry | {"service": "Open-Meteo", "status": 200, "duration_ms": 12.5} == entry

    def test_request_id_is_null_outside_a_request(self):
        assert format_record()["request_id"] is None

    def test_non_json_extras_are_dropped(self):
        entry = format_record(request=object(), user_id=None, tags=["a", object()])

        assert "request" not in entry
        assert entry["user_id"] is None
        assert entry["tags"] == ["a"]

    def test_exception_traceback_is_included(self):
        try:
            raise ValueError("échec")
        except ValueError:
            entry = format_record(exc_info=sys.exc_info())

        assert "ValueError: échec" in entry["exception"]


class TestRedaction:
    @pytest.mark.parametrize(
        "key", ["password", "new_password", "access", "refresh", "token", "Authorization"]
    )
    def test_sensitive_extras_are_masked(self, key):
        assert format_record(**{key: "s3cr3t"})[key] == REDACTED

    def test_nested_sensitive_extras_are_masked(self):
        entry = format_record(payload={"username": "alice", "password": "s3cr3t"})

        assert entry["payload"] == {"username": "alice", "password": REDACTED}

    def test_jwt_and_bearer_are_masked_in_messages_and_tracebacks(self):
        try:
            raise ValueError(f"jeton {JWT}")
        except ValueError:
            entry = format_record(
                "En-tête %s", ("Bearer abc.def",), exc_info=sys.exc_info(), detail=JWT
            )

        serialized = json.dumps(entry)
        assert JWT not in serialized and "abc.def" not in serialized
        assert entry["message"] == f"En-tête {REDACTED}"
        assert entry["detail"] == REDACTED


@pytest.mark.django_db
class TestRequestIdMiddleware:
    def test_generates_and_returns_an_id(self, client):
        response = client.get(reverse("health"))

        assert len(response["X-Request-ID"]) == 32

    def test_reuses_a_safe_incoming_id(self, client):
        response = client.get(reverse("health"), headers={"X-Request-ID": "proxy-42.a_b"})

        assert response["X-Request-ID"] == "proxy-42.a_b"

    @pytest.mark.parametrize("incoming", ["", "a b", "x" * 65, "id\nINJECTION", "<script>"])
    def test_replaces_an_unsafe_incoming_id(self, client, incoming):
        response = client.get(reverse("health"), headers={"X-Request-ID": incoming})

        assert response["X-Request-ID"] != incoming
        assert len(response["X-Request-ID"]) == 32

    def test_django_request_warnings_keep_the_id(self, client, request_logs):
        """django.request journalise les 4xx après la chaîne de middlewares."""
        response = client.get("/inconnu/", headers={"X-Request-ID": "req-404"})

        (record,) = [r for r in request_logs.records if r.name == "django.request"]
        assert response.status_code == 404
        assert record.request_id == "req-404"

    def test_server_errors_keep_the_id(self, client_a, trip_a, monkeypatch, request_logs):
        def boom(*args, **kwargs):
            raise RuntimeError("panne")

        monkeypatch.setattr("apps.trips.views.TripViewSet.list", boom)
        client_a.raise_request_exception = False

        response = client_a.get(reverse("trip-list"), headers={"X-Request-ID": "req-500"})

        (record,) = [r for r in request_logs.records if r.name == "django.request"]
        assert response.status_code == 500
        assert record.request_id == "req-500"

    def test_context_is_reset_after_the_request(self, client):
        client.get(reverse("health"))

        assert request_id_var.get() is None

    def test_access_log_line(self, client_for, owner, trip, request_logs):
        response = client_for(owner).get(
            reverse("trip-list"), {"search": "Japon"}, headers={"X-Request-ID": "req-1"}
        )

        (record,) = [r for r in request_logs.records if r.name == "travelhub.request"]
        assert record.levelno == logging.INFO
        assert record.request_id == "req-1" == response["X-Request-ID"]
        assert record.method == "GET"
        assert record.path == "/api/trips/"  # sans la chaîne de requête
        assert record.status == 200
        assert record.user_id == owner.pk
        assert record.duration_ms >= 0

    def test_anonymous_request_has_no_user(self, api_client, request_logs):
        api_client.get(reverse("trip-list"))

        (record,) = [r for r in request_logs.records if r.name == "travelhub.request"]
        assert record.status == 401
        assert record.user_id is None

    def test_health_checks_are_logged_at_debug_level(self, client, request_logs):
        client.get(reverse("health"))

        assert not [r for r in request_logs.records if r.name == "travelhub.request"]

    def test_logs_never_contain_tokens_or_passwords(self, api_client, make_user, json_console):
        """Bout en bout : connexion, appels avec un jeton valide et invalide, puis lecture
        des lignes JSON produites par le formateur de production."""
        make_user("carol")
        login = api_client.post(
            reverse("auth:token"), {"username": "carol", "password": "pw-Secret-123"}
        ).json()
        api_client.get(reverse("auth:me"), headers={"Authorization": f"Bearer {login['access']}"})
        api_client.get(reverse("auth:me"), headers={"Authorization": "Bearer invalide"})

        output = json_console.getvalue()
        lines = [json.loads(line) for line in output.splitlines()]
        assert [line["status"] for line in lines if line["logger"] == "travelhub.request"] == [
            200,
            200,
            401,
        ]
        assert login["access"] not in output and login["refresh"] not in output
        assert "pw-Secret-123" not in output and "invalide" not in output


class TestExternalCallsKeepTheRequestId:
    def test_overview_threads_inherit_the_request_id(
        self, client_for, owner, make_trip, make_destination, mock_http, request_logs
    ):
        today = timezone.localdate()
        trip = make_trip(owner=owner, start_date=today, end_date=today + timedelta(days=5))
        destination = make_destination(
            trip=trip,
            city="Kyoto",
            arrival_date=today,
            departure_date=today + timedelta(days=2),
            latitude=Decimal("35.0116"),
            longitude=Decimal("135.7681"),
        )
        mock_http.get(FORECAST_URL, json=forecast_payload())
        mock_http.post(GRAPHQL_URL, json=country_payload())

        response = client_for(owner).get(
            reverse("destination-overview", args=[destination.pk]),
            headers={"X-Request-ID": "overview-1"},
        )

        assert response.status_code == 200
        calls = [r for r in request_logs.records if getattr(r, "event", "") == "external_call"]
        assert {r.service for r in calls} == {"Open-Meteo", "Countries GraphQL"}
        assert {r.request_id for r in calls} == {"overview-1"}
        assert all(r.threadName.startswith("overview") for r in calls)
