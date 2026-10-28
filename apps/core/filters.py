from rest_framework.filters import OrderingFilter


class StableOrderingFilter(OrderingFilter):
    """OrderingFilter qui ajoute la clé primaire comme dernier critère de tri.

    Sans ça, deux voyages avec le même titre peuvent changer de page d'une requête
    à l'autre, parce que PostgreSQL ne garantit pas l'ordre des ex æquo.
    """

    def get_ordering(self, request, queryset, view):
        ordering = super().get_ordering(request, queryset, view)
        if not ordering or ordering[-1].lstrip("-") in ("pk", "id"):
            return ordering
        return [*ordering, "pk"]
