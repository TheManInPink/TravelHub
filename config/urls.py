"""Routage principal de TravelHub."""

from django.contrib import admin
from django.urls import path

admin.site.site_header = "TravelHub — administration"
admin.site.site_title = "TravelHub"
admin.site.index_title = "Gestion des données"

urlpatterns = [
    path("admin/", admin.site.urls),
]
