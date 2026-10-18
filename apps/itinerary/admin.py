from django.contrib import admin

from .models import Activity, Destination


class ActivityInline(admin.TabularInline):
    model = Activity
    extra = 0
    fields = ("date", "start_time", "name", "category", "cost")


@admin.register(Destination)
class DestinationAdmin(admin.ModelAdmin):
    list_display = ("city", "country_code", "trip", "order", "arrival_date", "departure_date")
    list_filter = ("country_code", "trip__status", ("trip", admin.RelatedOnlyFieldListFilter))
    search_fields = ("city", "country", "trip__title")
    date_hierarchy = "arrival_date"
    ordering = ("trip__start_date", "trip", "order")
    list_select_related = ("trip",)
    autocomplete_fields = ("trip",)
    readonly_fields = ("created_at", "updated_at")
    inlines = (ActivityInline,)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "date", "start_time", "cost", "destination", "trip")
    list_filter = ("category", "destination__country_code", "destination__trip__status")
    search_fields = ("name", "description", "destination__city", "destination__trip__title")
    date_hierarchy = "date"
    ordering = ("date", "start_time", "pk")
    list_select_related = ("destination__trip",)
    autocomplete_fields = ("destination",)
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="voyage", ordering="destination__trip__title")
    def trip(self, obj):
        return obj.destination.trip
