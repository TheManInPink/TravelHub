from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.core.testing import error_of
from apps.itinerary.models import Activity

Category = Activity.Category

LIST_URL = reverse("activity-list")


def detail_url(activity):
    return reverse("activity-detail", args=[activity.pk])


@pytest.fixture
def payload(destination):
    # La destination de Tokyo va du 1er au 7 juin 2027.
    return {
        "destination": destination.pk,
        "name": "Cérémonie du thé",
        "category": "culture",
        "date": "2027-06-03",
        "start_time": "14:00",
        "cost": "45.00",
    }


@pytest.fixture
def activity(make_activity):
    return make_activity()


@pytest.mark.django_db
class TestAuthenticationRequired:
    def test_list(self, api_client):
        assert api_client.get(LIST_URL).status_code == 401

    def test_detail(self, api_client, activity):
        assert api_client.get(detail_url(activity)).status_code == 401

    def test_delete(self, api_client, activity):
        assert api_client.delete(detail_url(activity)).status_code == 401
        assert Activity.objects.exists()


@pytest.mark.django_db
class TestCreate:
    @pytest.mark.parametrize("who", ["owner", "editor"])
    def test_owner_and_editor_can_create(self, client_for, owner, members, payload, who):
        user = owner if who == "owner" else members[who]

        response = client_for(user).post(LIST_URL, payload)

        assert response.status_code == 201
        assert response.data["cost"] == "45.00"
        assert response.data["trip"] == Activity.objects.get().destination.trip_id

    def test_viewer_gets_403(self, client_for, members, payload):
        assert client_for(members["viewer"]).post(LIST_URL, payload).status_code == 403
        assert not Activity.objects.exists()

    def test_stranger_gets_404(self, client_for, members, payload):
        response = client_for(members["stranger"]).post(LIST_URL, payload)
        assert response.status_code == 404
        assert error_of(response)["message"] == "Destination introuvable."
        assert not Activity.objects.exists()

    @pytest.mark.parametrize(
        ("changes", "field"),
        [
            ({"date": "2027-06-10"}, "date"),  # hors du séjour à Tokyo
            ({"cost": "-5"}, "cost"),
            ({"category": "inconnue"}, "category"),
            ({"name": ""}, "name"),
            ({"start_time": "25:00"}, "start_time"),
        ],
    )
    def test_invalid_fields_give_400(self, client_for, owner, payload, changes, field):
        response = client_for(owner).post(LIST_URL, {**payload, **changes})
        assert response.status_code == 400
        assert field in error_of(response)["details"]
        assert not Activity.objects.exists()


@pytest.mark.django_db
class TestReadAccess:
    def test_viewer_can_list_and_retrieve(self, client_for, members, activity):
        client = client_for(members["viewer"])
        assert [a["id"] for a in client.get(LIST_URL).data["results"]] == [activity.pk]
        assert client.get(detail_url(activity)).status_code == 200

    def test_stranger_sees_nothing(self, client_for, members, activity):
        client = client_for(members["stranger"])
        assert client.get(LIST_URL).data["count"] == 0
        assert client.get(detail_url(activity)).status_code == 404


@pytest.mark.django_db
class TestFilteringAndOrdering:
    @pytest.fixture
    def activities(self, trip, destination, make_destination, make_activity, make_trip):
        kyoto = make_destination(
            city="Kyoto", arrival_date=date(2027, 6, 8), departure_date=date(2027, 6, 12)
        )
        other_destination = make_destination(trip=make_trip(title="Autre"), order=1)
        return {
            "temple": make_activity(name="Temple", cost=Decimal("10"), date=date(2027, 6, 2)),
            "sushi": make_activity(
                name="Sushi", category=Category.FOOD, cost=Decimal("80"), date=date(2027, 6, 1)
            ),
            "geisha": make_activity(
                destination=kyoto,
                name="Gion",
                category=Category.CULTURE,
                cost=Decimal("35"),
                date=date(2027, 6, 9),
            ),
            "elsewhere": make_activity(destination=other_destination, name="Ailleurs"),
            "kyoto": kyoto,
        }

    def names(self, client, **params):
        response = client.get(LIST_URL, params)
        assert response.status_code == 200
        return [a["name"] for a in response.data["results"]]

    def test_filters(self, client_for, owner, trip, destination, activities):
        client = client_for(owner)
        assert self.names(client, trip=trip.pk) == ["Sushi", "Temple", "Gion"]
        assert self.names(client, destination=activities["kyoto"].pk) == ["Gion"]
        assert self.names(client, category="food") == ["Sushi"]
        assert self.names(client, date="2027-06-02") == ["Temple"]
        assert self.names(client, trip=trip.pk, date__gte="2027-06-02") == ["Temple", "Gion"]
        assert self.names(client, destination=destination.pk, date__lte="2027-06-01") == ["Sushi"]

    def test_ordering_by_cost_and_date(self, client_for, owner, trip, activities):
        client = client_for(owner)
        assert self.names(client, trip=trip.pk, ordering="cost") == ["Temple", "Gion", "Sushi"]
        assert self.names(client, trip=trip.pk, ordering="-cost") == ["Sushi", "Gion", "Temple"]
        assert self.names(client, trip=trip.pk, ordering="-date") == ["Gion", "Temple", "Sushi"]

    def test_invalid_category_filter_is_rejected(self, client_for, owner):
        response = client_for(owner).get(LIST_URL, {"category": "inconnue"})
        assert response.status_code == 400


@pytest.mark.django_db
class TestUpdateAndDelete:
    def test_editor_can_update(self, client_for, members, activity):
        response = client_for(members["editor"]).patch(detail_url(activity), {"cost": "12.50"})
        assert response.status_code == 200
        assert response.data["cost"] == "12.50"

    def test_owner_can_replace(self, client_for, owner, activity, payload):
        response = client_for(owner).put(detail_url(activity), payload)
        assert response.status_code == 200
        assert response.data["name"] == "Cérémonie du thé"

    def test_viewer_gets_403(self, client_for, members, activity):
        response = client_for(members["viewer"]).patch(detail_url(activity), {"cost": "0"})
        assert response.status_code == 403

    @pytest.mark.parametrize("method", ["patch", "delete"])
    def test_stranger_gets_404(self, client_for, members, activity, method):
        response = getattr(client_for(members["stranger"]), method)(
            detail_url(activity), {"cost": "0"}
        )
        assert response.status_code == 404
        assert Activity.objects.filter(pk=activity.pk).exists()

    def test_moving_to_another_destination_rechecks_date(
        self, client_for, owner, activity, make_destination
    ):
        kyoto = make_destination(
            city="Kyoto", arrival_date=date(2027, 6, 8), departure_date=date(2027, 6, 12)
        )
        response = client_for(owner).patch(detail_url(activity), {"destination": kyoto.pk})
        assert response.status_code == 400
        assert "date" in error_of(response)["details"]

    def test_editor_can_delete(self, client_for, members, activity):
        assert client_for(members["editor"]).delete(detail_url(activity)).status_code == 204
        assert not Activity.objects.exists()

    def test_viewer_cannot_delete(self, client_for, members, activity):
        assert client_for(members["viewer"]).delete(detail_url(activity)).status_code == 403
        assert Activity.objects.exists()
