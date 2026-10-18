from django.contrib import admin

from apps.itinerary.models import Destination

from .models import Trip, TripParticipant
from .services import ensure_owner_membership


class TripParticipantInline(admin.TabularInline):
    model = TripParticipant
    fk_name = "trip"
    extra = 0
    autocomplete_fields = ("user", "invited_by")


class DestinationInline(admin.TabularInline):
    model = Destination
    extra = 0
    fields = ("order", "city", "country", "country_code", "arrival_date", "departure_date")


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "start_date", "end_date", "status", "budget")
    list_filter = ("status",)
    search_fields = ("title", "owner__username", "owner__email")
    date_hierarchy = "start_date"
    autocomplete_fields = ("owner",)
    inlines = (TripParticipantInline, DestinationInline)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        # Même invariant que le service create_trip : le propriétaire est toujours participant.
        ensure_owner_membership(form.instance)
