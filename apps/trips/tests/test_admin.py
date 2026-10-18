import pytest
from django.urls import reverse

from apps.trips.models import Trip, TripParticipant


@pytest.mark.django_db
@pytest.mark.parametrize(
    "url_name",
    [
        "admin:trips_trip_changelist",
        "admin:itinerary_destination_changelist",
        "admin:itinerary_activity_changelist",
        "admin:trips_trip_add",
    ],
)
def test_admin_pages_load(admin_client, url_name):
    assert admin_client.get(reverse(url_name)).status_code == 200


@pytest.mark.django_db
def test_trip_created_in_admin_gets_owner_membership(admin_client, owner):
    inline_management = {
        f"{prefix}-{key}": value
        for prefix in ("memberships", "destinations")
        for key, value in (("TOTAL_FORMS", "0"), ("INITIAL_FORMS", "0"))
    }
    response = admin_client.post(
        reverse("admin:trips_trip_add"),
        {
            "owner": owner.pk,
            "title": "Portugal",
            "start_date": "2027-09-01",
            "end_date": "2027-09-10",
            "status": Trip.Status.PLANNED,
            **inline_management,
        },
    )
    assert response.status_code == 302, response.context["adminform"].errors
    trip = Trip.objects.get(title="Portugal")
    assert trip.memberships.get().role == TripParticipant.Role.OWNER
