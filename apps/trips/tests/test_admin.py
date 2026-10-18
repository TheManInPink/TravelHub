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


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("url_name", "params", "expected"),
    [
        ("admin:accounts_user_changelist", {"is_staff__exact": "0"}, 3),
        ("admin:trips_trip_changelist", {"status__exact": "planned"}, 1),
        ("admin:trips_trip_changelist", {"period": "future"}, 2),
        ("admin:trips_trip_changelist", {"period": "ongoing"}, 1),
        ("admin:trips_trip_changelist", {"q": "dakar"}, 1),
        ("admin:trips_tripparticipant_changelist", {"role__exact": "owner"}, 4),
        ("admin:trips_tripparticipant_changelist", {"trip__status__exact": "draft"}, 3),
        ("admin:itinerary_destination_changelist", {"country_code": "FR"}, 2),
        ("admin:itinerary_destination_changelist", {"trip__status__exact": "completed"}, 1),
        ("admin:itinerary_activity_changelist", {"category__exact": "transport"}, 2),
        ("admin:itinerary_activity_changelist", {"destination__country_code": "SN"}, 5),
    ],
)
def test_admin_changelists_are_filterable(admin_client, demo_data, url_name, params, expected):
    response = admin_client.get(reverse(url_name), params)
    assert response.status_code == 200
    assert response.context["cl"].result_count == expected


@pytest.mark.django_db
def test_trip_changelist_shows_totals_and_date_hierarchy(admin_client, demo_data):
    trip = Trip.objects.get(status=Trip.Status.PLANNED)
    response = admin_client.get(
        reverse("admin:trips_trip_changelist"), {"start_date__year": trip.start_date.year}
    )
    assert response.status_code == 200
    row = next(obj for obj in response.context["cl"].result_list if obj.pk == trip.pk)
    assert row.destination_count == 1
    assert row.total_cost > 0


@pytest.mark.django_db
def test_trip_change_page_shows_inlines_and_readonly_timestamps(admin_client, demo_data):
    trip = Trip.objects.get(title="Retrouvailles à Dakar")
    response = admin_client.get(reverse("admin:trips_trip_change", args=[trip.pk]))
    assert response.status_code == 200
    content = response.content.decode()
    assert 'name="created_at"' not in content
    assert "Dakar" in content
    assert len(response.context["inline_admin_formsets"]) == 2


@pytest.mark.django_db
def test_admin_bulk_delete_of_annotated_trips(admin_client, demo_data):
    pks = list(Trip.objects.filter(status=Trip.Status.DRAFT).values_list("pk", flat=True))
    response = admin_client.post(
        reverse("admin:trips_trip_changelist"),
        {"action": "delete_selected", "_selected_action": pks, "post": "yes"},
    )
    assert response.status_code == 302
    assert not Trip.objects.filter(pk__in=pks).exists()
