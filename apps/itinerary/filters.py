"""Filtres des destinations et des activités.

Les voyages et les destinations sont filtrés par identifiant brut (NumberFilter) et
pas avec ModelChoiceFilter. ModelChoiceFilter répondrait 400 pour un identifiant
inconnu mais 200 pour le voyage de quelqu'un d'autre, ce qui révélerait qu'il existe.
"""

import django_filters

from .models import Activity, Destination


class DestinationFilter(django_filters.FilterSet):
    """?trip=12&arrival_date__gte=2027-04-01&country_code=JP"""

    trip = django_filters.NumberFilter(field_name="trip")

    class Meta:
        model = Destination
        fields = {
            "country_code": ["exact"],
            "arrival_date": ["gte"],
            "departure_date": ["lte"],
        }


class ActivityFilter(django_filters.FilterSet):
    """?trip=12&destination=3&category=food&date=2027-04-02 (ou date__gte / date__lte)"""

    trip = django_filters.NumberFilter(field_name="destination__trip")
    destination = django_filters.NumberFilter(field_name="destination")

    class Meta:
        model = Activity
        fields = {
            "category": ["exact"],
            "date": ["exact", "gte", "lte"],
        }
