"""Jeu de données de démonstration avec 3 utilisateurs, 4 voyages, des destinations et
des activités.

Les dates dépendent du jour où on lance la commande. Le voyage « en cours » contient
toujours aujourd'hui, le voyage « terminé » est dans le passé et les autres sont à
venir.

On peut relancer la commande sans créer de doublons. Un voyage qui existe déjà (même
propriétaire, même titre) n'est pas recréé. --reset supprime d'abord les comptes de
démo, et leurs voyages partent en cascade.
"""

import os
from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.itinerary.models import Activity, ActivityCategory, Destination
from apps.trips.models import ParticipantRole, Trip, TripParticipant, TripStatus
from apps.trips.services import create_trip

# On reconnaît les comptes de démo à ce domaine (.example est réservé par la RFC 2606).
DEMO_EMAIL_DOMAIN = "demo.travelhub.example"

DEMO_USERS = (
    {"username": "alice", "first_name": "Alice", "last_name": "Tremblay"},
    {"username": "mamadou", "first_name": "Mamadou", "last_name": "Diop"},
    {"username": "yuki", "first_name": "Yuki", "last_name": "Tanaka"},
)

CITIES = {
    "montreal": {
        "city": "Montréal",
        "country": "Canada",
        "country_code": "CA",
        "latitude": Decimal("45.501689"),
        "longitude": Decimal("-73.567256"),
    },
    "paris": {
        "city": "Paris",
        "country": "France",
        "country_code": "FR",
        "latitude": Decimal("48.856614"),
        "longitude": Decimal("2.352222"),
    },
    "tokyo": {
        "city": "Tokyo",
        "country": "Japon",
        "country_code": "JP",
        "latitude": Decimal("35.676200"),
        "longitude": Decimal("139.650300"),
    },
    "dakar": {
        "city": "Dakar",
        "country": "Sénégal",
        "country_code": "SN",
        "latitude": Decimal("14.716677"),
        "longitude": Decimal("-17.467686"),
    },
}

Cat = ActivityCategory

# Les dates sont en jours par rapport à aujourd'hui (start, end, arrival, departure).
# Pour une activité, le premier élément compte depuis l'arrivée à la destination.
# Format d'une activité : (jour, nom, catégorie, heure de début ou None, coût).
DEMO_TRIPS = (
    {
        "owner": "alice",
        "title": "Week-end à Montréal",
        "description": "Long week-end entre amis : Vieux-Montréal, musées et mont Royal.",
        "status": TripStatus.COMPLETED,
        "start": -45,
        "end": -42,
        "budget": "1200.00",
        "participants": (("yuki", ParticipantRole.EDITOR),),
        "destinations": (
            {
                "city": "montreal",
                "arrival": -45,
                "departure": -42,
                "activities": (
                    (
                        0,
                        "Hôtel dans le Vieux-Montréal (3 nuits)",
                        Cat.ACCOMMODATION,
                        None,
                        "540.00",
                    ),
                    (0, "Visite guidée du Vieux-Montréal", Cat.SIGHTSEEING, "10:00", "35.00"),
                    (1, "Musée des beaux-arts de Montréal", Cat.CULTURE, "13:30", "24.00"),
                    (1, "Souper au marché Jean-Talon", Cat.FOOD, "19:00", "62.50"),
                    (2, "Randonnée au mont Royal", Cat.NATURE, "09:00", "0.00"),
                ),
            },
        ),
    },
    {
        "owner": "mamadou",
        "title": "Automne à Paris",
        "description": "Une semaine à Paris pendant les vacances d'automne.",
        "status": TripStatus.ONGOING,
        "start": -3,
        "end": 4,
        "budget": "2500.00",
        "participants": (("alice", ParticipantRole.EDITOR), ("yuki", ParticipantRole.VIEWER)),
        "destinations": (
            {
                "city": "paris",
                "arrival": -3,
                "departure": 4,
                "activities": (
                    (0, "Vol Montréal–Paris", Cat.TRANSPORT, "07:15", "850.00"),
                    (1, "Musée du Louvre", Cat.CULTURE, "09:30", "22.00"),
                    (2, "Montée à la tour Eiffel", Cat.SIGHTSEEING, "18:00", "29.40"),
                    (3, "Croisière sur la Seine", Cat.SIGHTSEEING, "20:30", "17.00"),
                    (5, "Pique-nique au jardin du Luxembourg", Cat.FOOD, "12:30", "25.00"),
                    (6, "Balade à vélo le long du canal Saint-Martin", Cat.SPORT, "10:00", "15.00"),
                ),
            },
        ),
    },
    {
        "owner": "yuki",
        "title": "Printemps au Japon",
        "description": "Deux semaines à Tokyo pendant la saison des cerisiers en fleurs.",
        "status": TripStatus.PLANNED,
        "start": 160,
        "end": 172,
        "budget": "4200.00",
        "participants": (("alice", ParticipantRole.VIEWER),),
        "destinations": (
            {
                "city": "tokyo",
                "arrival": 160,
                "departure": 172,
                "activities": (
                    (0, "Temple Sensō-ji", Cat.SIGHTSEEING, "08:30", "0.00"),
                    (1, "teamLab Planets", Cat.CULTURE, "11:00", "38.00"),
                    (2, "Visite gourmande du marché de Tsukiji", Cat.FOOD, "07:00", "85.00"),
                    (4, "Randonnée au mont Takao", Cat.NATURE, "08:00", "12.00"),
                    (6, "Ryokan à Asakusa (3 nuits)", Cat.ACCOMMODATION, None, "690.00"),
                ),
            },
        ),
    },
    {
        "owner": "mamadou",
        "title": "Retrouvailles à Dakar",
        "description": "Visite de la famille, avec une escale à Paris à l'aller.",
        "status": TripStatus.DRAFT,
        "start": 250,
        "end": 262,
        "budget": None,
        "participants": (("alice", ParticipantRole.EDITOR), ("yuki", ParticipantRole.VIEWER)),
        "destinations": (
            {
                "city": "paris",
                "arrival": 250,
                "departure": 251,
                "activities": (
                    (0, "Escale : balade dans le Marais", Cat.SIGHTSEEING, "15:00", "0.00"),
                ),
            },
            {
                "city": "dakar",
                "arrival": 252,
                "departure": 262,
                "activities": (
                    (0, "Vol Paris–Dakar", Cat.TRANSPORT, "09:40", "410.00"),
                    (1, "Traversée vers l'île de Gorée", Cat.CULTURE, "10:00", "18.00"),
                    (2, "Monument de la Renaissance africaine", Cat.SIGHTSEEING, "16:00", "9.00"),
                    (3, "Thiéboudienne au marché Kermel", Cat.FOOD, "13:00", "14.00"),
                    (5, "Excursion au lac Rose", Cat.NATURE, "08:00", "45.00"),
                ),
            },
        ),
    },
)


def demo_users():
    return get_user_model().objects.filter(email__endswith=f"@{DEMO_EMAIL_DOMAIN}")


def _save_valid(instance):
    # On applique les mêmes validations que l'admin et l'API (dates, codes pays, etc.).
    instance.full_clean()
    instance.save()
    return instance


class Command(BaseCommand):
    help = (
        "Crée les données de démonstration (3 utilisateurs, 4 voyages, destinations, "
        "activités). Relancer la commande ne crée pas de doublons."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Supprime les comptes de démo et leurs voyages avant de les recréer.",
        )
        parser.add_argument(
            "--password",
            help=(
                "Mot de passe des comptes de démo créés (défaut : variable DEMO_PASSWORD ; "
                "sans valeur, les comptes ne peuvent pas se connecter)."
            ),
        )

    @transaction.atomic
    def handle(self, *args, reset, password, **options):
        password = password or os.environ.get("DEMO_PASSWORD")
        today = timezone.localdate()

        if reset:
            count = demo_users().count()
            demo_users().delete()
            self.stdout.write(f"{count} compte(s) de démo supprimé(s), avec leurs voyages.")

        users = {}
        created_users = 0
        for spec in DEMO_USERS:
            users[spec["username"]], created = self._get_or_create_user(spec, password)
            created_users += created

        created_trips = 0
        for spec in DEMO_TRIPS:
            owner = users[spec["owner"]]
            if Trip.objects.filter(owner=owner, title=spec["title"]).exists():
                continue
            self._create_trip(spec, users, today)
            created_trips += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Utilisateurs créés : {created_users}/{len(DEMO_USERS)}, "
                f"voyages créés : {created_trips}/{len(DEMO_TRIPS)}."
            )
        )
        if created_users and not password:
            self.stdout.write(
                self.style.WARNING(
                    "Comptes créés sans mot de passe utilisable : passez --password "
                    "ou définissez DEMO_PASSWORD (puis --reset) pour pouvoir s'y connecter."
                )
            )

    def _get_or_create_user(self, spec, password):
        User = get_user_model()
        email = f"{spec['username']}@{DEMO_EMAIL_DOMAIN}"
        user = User.objects.filter(username=spec["username"]).first()
        if user is not None:
            if user.email != email:
                raise CommandError(
                    f"L'utilisateur « {user.username} » existe déjà et ne fait pas partie "
                    "des données de démo : aucune donnée n'a été modifiée."
                )
            return user, False
        # password=None donne un mot de passe inutilisable.
        user = User.objects.create_user(
            spec["username"],
            email=email,
            password=password,
            first_name=spec["first_name"],
            last_name=spec["last_name"],
        )
        return user, True

    def _create_trip(self, spec, users, today):
        def day(offset):
            return today + timedelta(days=offset)

        owner = users[spec["owner"]]
        trip = create_trip(
            owner=owner,
            title=spec["title"],
            description=spec["description"],
            status=spec["status"],
            start_date=day(spec["start"]),
            end_date=day(spec["end"]),
            budget=Decimal(spec["budget"]) if spec["budget"] else None,
        )
        for username, role in spec["participants"]:
            _save_valid(
                TripParticipant(trip=trip, user=users[username], role=role, invited_by=owner)
            )
        for order, dest_spec in enumerate(spec["destinations"], start=1):
            destination = _save_valid(
                Destination(
                    trip=trip,
                    order=order,
                    arrival_date=day(dest_spec["arrival"]),
                    departure_date=day(dest_spec["departure"]),
                    **CITIES[dest_spec["city"]],
                )
            )
            for offset, name, category, start_time, cost in dest_spec["activities"]:
                _save_valid(
                    Activity(
                        destination=destination,
                        name=name,
                        category=category,
                        date=destination.arrival_date + timedelta(days=offset),
                        start_time=time.fromisoformat(start_time) if start_time else None,
                        cost=Decimal(cost),
                    )
                )
        return trip
