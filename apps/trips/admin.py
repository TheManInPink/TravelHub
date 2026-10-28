from django.contrib import admin
from django.utils import timezone

from apps.itinerary.models import Destination

from .models import Trip, TripParticipant
from .services import ensure_owner_membership


class TripPeriodFilter(admin.SimpleListFilter):
    """Situe le voyage par rapport à aujourd'hui, indépendamment de son statut."""

    title = "période"
    parameter_name = "period"

    def lookups(self, request, model_admin):
        return (("past", "Passés"), ("ongoing", "En cours"), ("future", "À venir"))

    def queryset(self, request, queryset):
        today = timezone.localdate()
        match self.value():
            case "past":
                return queryset.filter(end_date__lt=today)
            case "ongoing":
                return queryset.filter(start_date__lte=today, end_date__gte=today)
            case "future":
                return queryset.filter(start_date__gt=today)
        return queryset


class TripParticipantInline(admin.TabularInline):
    model = TripParticipant
    fk_name = "trip"
    extra = 0
    fields = ("user", "role", "invited_by", "joined_at")
    autocomplete_fields = ("user", "invited_by")


class DestinationInline(admin.TabularInline):
    model = Destination
    extra = 0
    fields = ("order", "city", "country", "country_code", "arrival_date", "departure_date")
    # On gère les activités depuis la fiche de la destination, car Django ne permet pas
    # d'inline imbriqué.
    show_change_link = True


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "owner",
        "status",
        "start_date",
        "end_date",
        "budget",
        "destination_count",
        "total_cost",
    )
    list_filter = ("status", TripPeriodFilter, ("owner", admin.RelatedOnlyFieldListFilter))
    search_fields = ("title", "description", "owner__username", "owner__email")
    date_hierarchy = "start_date"
    ordering = ("start_date", "pk")
    list_select_related = ("owner",)
    autocomplete_fields = ("owner",)
    readonly_fields = ("created_at", "updated_at")
    inlines = (TripParticipantInline, DestinationInline)

    def get_queryset(self, request):
        return super().get_queryset(request).with_totals()

    @admin.display(description="destinations", ordering="destination_count")
    def destination_count(self, obj):
        return obj.destination_count

    @admin.display(description="coût des activités", ordering="total_cost")
    def total_cost(self, obj):
        return obj.total_cost

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        # Comme dans le service create_trip, le propriétaire doit toujours être participant.
        ensure_owner_membership(form.instance)


@admin.register(TripParticipant)
class TripParticipantAdmin(admin.ModelAdmin):
    list_display = ("user", "trip", "role", "invited_by", "joined_at")
    list_filter = ("role", "trip__status", ("trip", admin.RelatedOnlyFieldListFilter))
    search_fields = ("user__username", "user__email", "trip__title")
    date_hierarchy = "joined_at"
    ordering = ("trip__start_date", "trip", "joined_at")
    list_select_related = ("user", "trip", "invited_by")
    autocomplete_fields = ("trip", "user", "invited_by")
