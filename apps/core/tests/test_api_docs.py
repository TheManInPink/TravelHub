import pytest
from django.urls import reverse
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.core.filters import StableOrderingFilter
from apps.trips.models import Trip
from apps.trips.views import TripViewSet


@pytest.mark.django_db
class TestDocumentation:
    def test_schema_is_public_and_declares_jwt(self, api_client):
        response = api_client.get(reverse("schema"), {"format": "json"})

        assert response.status_code == 200
        schema = response.json()
        assert schema["components"]["securitySchemes"]["jwtAuth"]["scheme"] == "bearer"
        assert "/api/trips/{id}/" in schema["paths"]
        assert "/api/auth/token/" in schema["paths"]

    def test_trip_endpoints_document_error_codes(self, api_client):
        paths = api_client.get(reverse("schema"), {"format": "json"}).json()["paths"]
        patch = paths["/api/trips/{id}/"]["patch"]
        assert {"200", "400", "401", "403", "404"} <= set(patch["responses"])

    def test_participant_list_is_documented_as_a_plain_list(self, api_client):
        paths = api_client.get(reverse("schema"), {"format": "json"}).json()["paths"]
        response = paths["/api/trips/{id}/participants/"]["get"]["responses"]["200"]

        assert response["content"]["application/json"]["schema"] == {
            "type": "array",
            "items": {"$ref": "#/components/schemas/Participant"},
        }

    def test_trip_documents_cover_image_and_read_only_role(self, api_client):
        schemas = api_client.get(reverse("schema"), {"format": "json"}).json()["components"]
        trip, trip_request = schemas["schemas"]["Trip"], schemas["schemas"]["TripRequest"]

        assert trip["properties"]["my_role"]["readOnly"] is True
        assert "my_role" in trip["required"]
        assert "my_role" not in trip_request["properties"]
        assert "cover_image_url" in trip_request["properties"]

    @pytest.mark.parametrize("name", ["swagger-ui", "redoc"])
    def test_ui_pages_are_public(self, api_client, name):
        assert api_client.get(reverse(name)).status_code == 200


class TestStableOrderingFilter:
    def ordering_for(self, query):
        request = Request(APIRequestFactory().get("/", query))
        view = TripViewSet()
        return StableOrderingFilter().get_ordering(request, Trip.objects.none(), view)

    def test_appends_pk_as_tiebreaker(self):
        assert self.ordering_for({"ordering": "-title"}) == ["-title", "pk"]

    def test_default_ordering_also_gets_tiebreaker(self):
        assert self.ordering_for({}) == ["start_date", "pk"]
