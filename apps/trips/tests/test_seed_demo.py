import io

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from apps.itinerary.models import Activity, Destination
from apps.trips.management.commands.seed_demo import demo_users
from apps.trips.models import Trip, TripParticipant


def seed(*args):
    out = io.StringIO()
    call_command("seed_demo", *args, stdout=out)
    return out.getvalue()


def counts():
    return (
        demo_users().count(),
        Trip.objects.count(),
        TripParticipant.objects.count(),
        Destination.objects.count(),
        Activity.objects.count(),
    )


@pytest.fixture(autouse=True)
def no_demo_password(monkeypatch):
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)


@pytest.mark.django_db
def test_seed_creates_demo_dataset():
    seed()
    assert demo_users().count() == 3
    assert Trip.objects.count() == 4
    assert set(Trip.objects.values_list("status", flat=True)) == {
        Trip.Status.COMPLETED,
        Trip.Status.ONGOING,
        Trip.Status.PLANNED,
        Trip.Status.DRAFT,
    }
    assert set(Destination.objects.values_list("country_code", flat=True)) == {
        "CA",
        "FR",
        "JP",
        "SN",
    }
    assert Activity.objects.filter(cost__gt=0).exists()


@pytest.mark.django_db
def test_seed_respects_model_invariants():
    seed()
    for trip in Trip.objects.all():
        assert trip.memberships.get(role=TripParticipant.Role.OWNER).user == trip.owner
    ongoing = Trip.objects.get(status=Trip.Status.ONGOING)
    assert ongoing.start_date <= timezone.localdate() <= ongoing.end_date
    totals = Trip.objects.with_totals().get(title="Retrouvailles à Dakar")
    assert totals.destination_count == 2
    assert totals.total_cost > 0


@pytest.mark.django_db
def test_seed_is_idempotent():
    seed()
    before = counts()
    output = seed()
    assert counts() == before
    assert "voyages créés : 0/4" in output


@pytest.mark.django_db
def test_seed_reset_recreates_demo_data_only(owner):
    seed()
    old_trip_ids = set(Trip.objects.values_list("pk", flat=True))
    before = counts()
    seed("--reset")
    assert counts() == before
    assert old_trip_ids.isdisjoint(Trip.objects.values_list("pk", flat=True))
    owner.refresh_from_db()  # utilisateur hors démo conservé


@pytest.mark.django_db
def test_seed_recreates_missing_trip():
    seed()
    Trip.objects.get(title="Automne à Paris").delete()
    seed()
    assert Trip.objects.filter(title="Automne à Paris").exists()


@pytest.mark.django_db
def test_seed_without_password_creates_unusable_accounts():
    output = seed()
    assert not any(user.has_usable_password() for user in demo_users())
    assert "--password" in output


@pytest.mark.django_db
def test_seed_password_option():
    seed("--password", "Demo-Voyage-2026")
    assert all(user.check_password("Demo-Voyage-2026") for user in demo_users())


@pytest.mark.django_db
def test_seed_password_from_environment(monkeypatch):
    monkeypatch.setenv("DEMO_PASSWORD", "Env-Voyage-2026")
    seed()
    assert demo_users().first().check_password("Env-Voyage-2026")


@pytest.mark.django_db
def test_seed_refuses_to_reuse_non_demo_account(make_user):
    make_user("yuki")
    with pytest.raises(CommandError, match="yuki"):
        seed()
    # yuki est traité en dernier. alice et mamadou, déjà créés, sont annulés avec la
    # transaction.
    assert not demo_users().exists()
    assert not Trip.objects.exists()
