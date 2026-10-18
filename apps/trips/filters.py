import django_filters

from .models import Trip


class TripFilter(django_filters.FilterSet):
    """?status=planned&start_date__gte=2027-01-01&end_date__lte=2027-12-31&title__icontains=japon"""

    class Meta:
        model = Trip
        fields = {
            "status": ["exact"],
            "start_date": ["gte"],
            "end_date": ["lte"],
            "title": ["icontains"],
        }
