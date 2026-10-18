from django.contrib import admin

from .models import Activity, Destination


class ActivityInline(admin.TabularInline):
    model = Activity
    extra = 0
    fields = ("date", "start_time", "name", "category", "cost")


@admin.register(Destination)
class DestinationAdmin(admin.ModelAdmin):
    list_display = ("city", "country_code", "trip", "order", "arrival_date", "departure_date")
    list_filter = ("country_code",)
    search_fields = ("city", "country", "trip__title")
    list_select_related = ("trip",)
    autocomplete_fields = ("trip",)
    inlines = (ActivityInline,)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "date", "start_time", "cost", "destination")
    list_filter = ("category",)
    search_fields = ("name", "destination__city")
    list_select_related = ("destination",)
    autocomplete_fields = ("destination",)
