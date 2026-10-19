from datetime import date

import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework.exceptions import NotAuthenticated

from apps.core.exceptions import INTEGRITY_MESSAGE, exception_handler
from apps.core.testing import error_of
from apps.integrations.exceptions import (
    ExternalServiceTimeout,
    ExternalServiceUnavailable,
    LocationNotFound,
    NoDataAvailable,
)
from apps.trips.models import Trip, TripParticipant


def body(exc):
    response = exception_handler(exc, {})
    return response.status_code, response.data["error"]


def capture_integrity_error(callback):
    # Point de sauvegarde : la transaction du test reste utilisable après l'erreur.
    with pytest.raises(IntegrityError) as caught, transaction.atomic():
        callback()
    return caught.value


class TestConversions:
    def test_django_validation_error_becomes_400_with_field_details(self):
        exc = DjangoValidationError({"end_date": "Trop tôt.", "__all__": "Incohérent."})

        status, error = body(exc)

        assert status == 400
        assert error["code"] == "validation_error"
        assert error["message"] == "Les données envoyées sont invalides."
        assert error["details"] == {"end_date": ["Trop tôt."], "non_field_errors": ["Incohérent."]}

    def test_single_global_error_is_used_as_message(self):
        status, error = body(DjangoValidationError("Le voyage doit garder son propriétaire."))
        assert status == 400
        assert error["message"] == "Le voyage doit garder son propriétaire."
        assert error["details"] == {"non_field_errors": ["Le voyage doit garder son propriétaire."]}

    def test_unexpected_exception_is_left_to_django(self):
        assert exception_handler(RuntimeError("boum"), {}) is None

    def test_api_exception_keeps_its_code_and_headers(self):
        response = exception_handler(NotAuthenticated(), {})
        assert response.status_code == 401
        assert response.data == {
            "error": {
                "code": "not_authenticated",
                "message": "Informations d'authentification non fournies.",
                "details": {},
            }
        }

    @pytest.mark.parametrize(
        ("exc", "status", "code"),
        [
            (LocationNotFound("Ville introuvable."), 404, "location_not_found"),
            (NoDataAvailable(), 404, "no_data_available"),
            (ExternalServiceUnavailable(), 503, "external_service_unavailable"),
            (ExternalServiceTimeout(), 504, "external_service_timeout"),
        ],
    )
    def test_integration_errors_keep_their_status_and_code(self, exc, status, code):
        assert body(exc) == (status, {"code": code, "message": exc.message, "details": {}})


@pytest.mark.django_db
class TestIntegrityError:
    def test_message_comes_from_violated_constraint(self, trip, make_user):
        viewer = make_user()
        TripParticipant.objects.create(trip=trip, user=viewer)
        exc = capture_integrity_error(
            lambda: TripParticipant.objects.create(trip=trip, user=viewer)
        )

        status, error = body(exc)

        assert status == 400
        assert error["code"] == "integrity_error"
        assert error["message"] == "Cet utilisateur participe déjà à ce voyage."

    def test_check_constraint_is_also_translated(self, owner):
        exc = capture_integrity_error(
            lambda: Trip.objects.create(
                owner=owner, title="X", start_date=date(2027, 1, 2), end_date=date(2027, 1, 1)
            )
        )
        _, error = body(exc)
        assert error["message"] == (
            "La date de fin doit être postérieure ou égale à la date de début."
        )

    def test_unknown_constraint_gets_generic_message(self):
        _, error = body(IntegrityError("violation"))
        assert error == {
            "code": "integrity_error",
            "message": INTEGRITY_MESSAGE,
            "details": {"non_field_errors": [INTEGRITY_MESSAGE]},
        }


@pytest.mark.django_db
class TestEnvelopeThroughTheApi:
    def test_401(self, api_client):
        response = api_client.get(reverse("trip-list"))
        assert response.status_code == 401
        assert error_of(response)["code"] == "not_authenticated"
        assert response["WWW-Authenticate"].startswith("Bearer")

    def test_invalid_jwt_keeps_simplejwt_details(self, api_client):
        api_client.credentials(HTTP_AUTHORIZATION="Bearer pas-un-jwt")
        error = error_of(api_client.get(reverse("trip-list")))
        assert error["code"] == "token_not_valid"
        assert "messages" in error["details"]

    def test_403(self, client_for, trip, members):
        response = client_for(members["viewer"]).delete(reverse("trip-detail", args=[trip.pk]))
        assert response.status_code == 403
        assert error_of(response) == {
            "code": "permission_denied",
            "message": "Seul le propriétaire peut effectuer cette action sur ce voyage.",
            "details": {},
        }

    def test_404(self, client_for, trip, members):
        response = client_for(members["stranger"]).get(reverse("trip-detail", args=[trip.pk]))
        assert response.status_code == 404
        assert error_of(response) == {"code": "not_found", "message": "Non trouvé.", "details": {}}

    def test_400(self, client_for, owner):
        response = client_for(owner).post(reverse("trip-list"), {"title": ""})
        assert response.status_code == 400
        error = error_of(response)
        assert error["code"] == "validation_error"
        assert {"title", "start_date", "end_date"} <= set(error["details"])
