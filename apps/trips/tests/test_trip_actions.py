from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.core.testing import error_of
from apps.itinerary.models import Activity
from apps.trips.models import Trip, TripParticipant
from apps.trips.services import LAST_OWNER_MESSAGE

Role = TripParticipant.Role
Category = Activity.Category


def stats_url(trip):
    return reverse("trip-stats", args=[trip.pk])


def clone_url(trip):
    return reverse("trip-clone", args=[trip.pk])


def participants_url(trip):
    return reverse("trip-participants", args=[trip.pk])


def participant_url(trip, user):
    return reverse("trip-participant-detail", args=[trip.pk, user.pk])


@pytest.mark.django_db
class TestStats:
    def test_aggregates_by_category(
        self, client_for, members, trip, destination, make_destination, make_activity
    ):
        trip.budget = Decimal("500.00")
        trip.save()
        kyoto = make_destination(
            city="Kyoto", arrival_date=date(2027, 6, 8), departure_date=date(2027, 6, 12)
        )
        make_activity(category=Category.FOOD, cost=Decimal("30.00"))
        make_activity(category=Category.FOOD, cost=Decimal("10.00"))
        make_activity(destination=kyoto, date=kyoto.arrival_date, cost=Decimal("100.00"))
        make_destination(
            city="Osaka", arrival_date=date(2027, 6, 13), departure_date=date(2027, 6, 14)
        )

        response = client_for(members["viewer"]).get(stats_url(trip))

        assert response.status_code == 200
        assert response.json() == {
            "trip": trip.pk,
            "budget": "500.00",
            "total_cost": "140.00",
            "remaining_budget": "360.00",
            "destination_count": 3,
            "activity_count": 3,
            "average_cost": "46.67",
            "by_category": [
                {
                    "category": "sightseeing",
                    "label": "Visite",
                    "count": 1,
                    "total_cost": "100.00",
                    "average_cost": "100.00",
                },
                {
                    "category": "food",
                    "label": "Restauration",
                    "count": 2,
                    "total_cost": "40.00",
                    "average_cost": "20.00",
                },
            ],
        }

    def test_empty_trip_without_budget(self, client_for, owner, trip):
        data = client_for(owner).get(stats_url(trip)).json()
        assert data["total_cost"] == "0.00"
        assert data["remaining_budget"] is None
        assert data["average_cost"] is None
        assert data["by_category"] == []

    def test_over_budget_gives_negative_remainder(self, client_for, owner, trip, make_activity):
        trip.budget = Decimal("20.00")
        trip.save()
        make_activity(cost=Decimal("25.00"))
        assert client_for(owner).get(stats_url(trip)).json()["remaining_budget"] == "-5.00"

    def test_requires_authentication(self, api_client, trip):
        assert api_client.get(stats_url(trip)).status_code == 401

    def test_stranger_gets_404(self, client_for, members, trip):
        assert client_for(members["stranger"]).get(stats_url(trip)).status_code == 404


@pytest.mark.django_db
class TestClone:
    @pytest.fixture
    def source(self, trip, destination, make_destination, make_activity):
        trip.budget = Decimal("900.00")
        trip.status = Trip.Status.PLANNED
        trip.save()
        kyoto = make_destination(
            city="Kyoto", arrival_date=date(2027, 6, 8), departure_date=date(2027, 6, 12)
        )
        make_activity(name="Senso-ji", cost=Decimal("0"))
        make_activity(name="Sushi", category=Category.FOOD, cost=Decimal("80.00"))
        make_activity(destination=kyoto, name="Gion", date=kyoto.arrival_date, cost=Decimal("35"))
        return trip

    def test_viewer_clones_into_own_draft(self, client_for, members, source):
        viewer = members["viewer"]

        response = client_for(viewer).post(clone_url(source))

        assert response.status_code == 201
        copy = Trip.objects.get(pk=response.data["id"])
        assert copy.pk != source.pk
        assert copy.title == "Copie de Voyage au Japon"
        assert copy.owner == viewer
        assert copy.status == Trip.Status.DRAFT
        assert copy.budget == source.budget
        assert list(copy.memberships.values_list("user", "role")) == [(viewer.pk, Role.OWNER)]
        assert response.data["destination_count"] == 2
        assert response.data["activity_count"] == 3
        assert response.data["total_cost"] == "115.00"

        def itinerary(trip):
            return [
                (d.order, d.city, [(a.name, a.date, a.cost) for a in d.activities.all()])
                for d in trip.destinations.order_by("order")
            ]

        assert itinerary(copy) == itinerary(source)
        # L'original est intact.
        assert source.destinations.count() == 2
        assert Activity.objects.filter(destination__trip=source).count() == 3

    def test_custom_title(self, client_for, owner, source):
        response = client_for(owner).post(clone_url(source), {"title": "Japon 2028"})
        assert response.status_code == 201
        assert response.data["title"] == "Japon 2028"

    def test_title_too_long_gives_400(self, client_for, owner, source):
        response = client_for(owner).post(clone_url(source), {"title": "x" * 201})
        assert response.status_code == 400
        assert "title" in error_of(response)["details"]
        assert Trip.objects.count() == 1

    def test_requires_authentication(self, api_client, source):
        assert api_client.post(clone_url(source)).status_code == 401
        assert Trip.objects.count() == 1

    def test_stranger_gets_404(self, client_for, members, source):
        assert client_for(members["stranger"]).post(clone_url(source)).status_code == 404
        assert Trip.objects.count() == 1


@pytest.mark.django_db
class TestParticipantList:
    def test_any_member_can_list(self, client_for, members, trip):
        response = client_for(members["viewer"]).get(participants_url(trip))
        assert response.status_code == 200
        assert [(p["user"]["username"], p["role"]) for p in response.data] == [
            ("owner", "owner"),
            ("editor", "editor"),
            ("viewer", "viewer"),
        ]

    def test_requires_authentication(self, api_client, trip):
        assert api_client.get(participants_url(trip)).status_code == 401

    def test_stranger_gets_404(self, client_for, members, trip):
        assert client_for(members["stranger"]).get(participants_url(trip)).status_code == 404


@pytest.mark.django_db
class TestParticipantAdd:
    def test_owner_adds_by_email(self, client_for, owner, trip, make_user):
        newcomer = make_user("newcomer")

        response = client_for(owner).post(
            participants_url(trip), {"email": "NEWCOMER@example.com", "role": "editor"}
        )

        assert response.status_code == 201
        assert response.data["user"]["username"] == "newcomer"
        assert response.data["role"] == "editor"
        assert response.data["invited_by"]["username"] == "owner"
        assert trip.memberships.get(user=newcomer).role == Role.EDITOR

    def test_role_defaults_to_viewer(self, client_for, owner, trip, make_user):
        make_user("newcomer")
        response = client_for(owner).post(participants_url(trip), {"email": "newcomer@example.com"})
        assert response.data["role"] == "viewer"

    @pytest.mark.parametrize("who", ["editor", "viewer"])
    def test_non_owner_gets_403(self, client_for, members, trip, make_user, who):
        make_user("newcomer")
        response = client_for(members[who]).post(
            participants_url(trip), {"email": "newcomer@example.com"}
        )
        assert response.status_code == 403
        assert trip.memberships.count() == 3

    def test_stranger_gets_404(self, client_for, members, trip):
        response = client_for(members["stranger"]).post(
            participants_url(trip), {"email": "stranger@example.com"}
        )
        assert response.status_code == 404

    def test_requires_authentication(self, api_client, trip):
        response = api_client.post(participants_url(trip), {"email": "x@example.com"})
        assert response.status_code == 401

    @pytest.mark.parametrize(
        ("body", "field"),
        [
            ({"email": "personne@example.com"}, "email"),
            ({"email": "owner@example.com"}, "email"),
            ({"email": "pas-un-courriel"}, "email"),
            ({"email": "viewer@example.com", "role": "owner"}, "role"),
        ],
    )
    def test_invalid_requests_give_400(self, client_for, owner, trip, members, body, field):
        response = client_for(owner).post(participants_url(trip), body)
        assert response.status_code == 400
        assert field in error_of(response)["details"]

    def test_duplicate_is_rejected_by_the_database(self, client_for, owner, trip, members):
        client = client_for(owner)

        response = client.post(participants_url(trip), {"email": "viewer@example.com"})

        assert response.status_code == 400
        assert error_of(response) == {
            "code": "integrity_error",
            "message": "Cet utilisateur participe déjà à ce voyage.",
            "details": {"non_field_errors": ["Cet utilisateur participe déjà à ce voyage."]},
        }
        # Le point de sauvegarde a annulé l'INSERT : la connexion reste utilisable.
        assert client.get(participants_url(trip)).status_code == 200


@pytest.mark.django_db
class TestParticipantRole:
    def test_owner_changes_role(self, client_for, owner, trip, members):
        response = client_for(owner).patch(
            participant_url(trip, members["viewer"]), {"role": "editor"}
        )
        assert response.status_code == 200
        assert response.data["role"] == "editor"
        assert trip.memberships.get(user=members["viewer"]).role == Role.EDITOR

    def test_giving_owner_role_transfers_ownership(self, client_for, owner, trip, members):
        editor = members["editor"]

        response = client_for(owner).patch(participant_url(trip, editor), {"role": "owner"})

        assert response.status_code == 200
        assert response.data["role"] == "owner"
        trip.refresh_from_db()
        assert trip.owner == editor
        assert trip.memberships.get(user=owner).role == Role.EDITOR
        # L'ancien propriétaire n'a plus la main sur les participants.
        response = client_for(owner).patch(participant_url(trip, editor), {"role": "viewer"})
        assert response.status_code == 403

    def test_owner_cannot_demote_themself(self, client_for, owner, trip, members):
        response = client_for(owner).patch(participant_url(trip, owner), {"role": "editor"})
        assert response.status_code == 400
        assert error_of(response)["details"] == {"role": [LAST_OWNER_MESSAGE]}
        assert trip.memberships.get(user=owner).role == Role.OWNER

    def test_invalid_role_gives_400(self, client_for, owner, trip, members):
        response = client_for(owner).patch(participant_url(trip, members["viewer"]), {"role": "x"})
        assert response.status_code == 400

    def test_editor_gets_403(self, client_for, members, trip):
        response = client_for(members["editor"]).patch(
            participant_url(trip, members["viewer"]), {"role": "editor"}
        )
        assert response.status_code == 403

    def test_non_participant_target_gets_404(self, client_for, owner, trip, members):
        response = client_for(owner).patch(
            participant_url(trip, members["stranger"]), {"role": "editor"}
        )
        assert response.status_code == 404

    def test_stranger_gets_404(self, client_for, members, trip):
        response = client_for(members["stranger"]).patch(
            participant_url(trip, members["viewer"]), {"role": "editor"}
        )
        assert response.status_code == 404

    def test_requires_authentication(self, api_client, trip, members):
        response = api_client.patch(participant_url(trip, members["viewer"]), {"role": "editor"})
        assert response.status_code == 401


@pytest.mark.django_db
class TestParticipantRemove:
    def test_owner_removes_participant(self, client_for, owner, trip, members):
        response = client_for(owner).delete(participant_url(trip, members["editor"]))
        assert response.status_code == 204
        assert not trip.memberships.filter(user=members["editor"]).exists()
        # Retiré, l'ancien éditeur ne voit plus le voyage.
        assert client_for(members["editor"]).get(stats_url(trip)).status_code == 404

    def test_cannot_remove_last_owner(self, client_for, owner, trip, members):
        response = client_for(owner).delete(participant_url(trip, owner))
        assert response.status_code == 400
        assert error_of(response)["message"] == LAST_OWNER_MESSAGE
        assert trip.memberships.filter(user=owner, role=Role.OWNER).exists()

    def test_editor_gets_403(self, client_for, members, trip):
        response = client_for(members["editor"]).delete(participant_url(trip, members["viewer"]))
        assert response.status_code == 403
        assert trip.memberships.count() == 3

    def test_stranger_gets_404(self, client_for, members, trip):
        response = client_for(members["stranger"]).delete(participant_url(trip, members["viewer"]))
        assert response.status_code == 404

    def test_requires_authentication(self, api_client, trip, members):
        assert api_client.delete(participant_url(trip, members["viewer"])).status_code == 401
        assert trip.memberships.count() == 3
