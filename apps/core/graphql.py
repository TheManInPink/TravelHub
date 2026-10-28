"""Fonctions communes aux schémas GraphQL des applications.

Les resolvers lèvent les mêmes exceptions que l'API REST (NotAuthenticated, NotFound,
PermissionDenied, les ValidationError de DRF et de Django, les erreurs des services
externes). TravelHubGraphQLView les transforme en erreurs GraphQL. Le code et les
détails de l'erreur REST équivalente sont mis dans extensions.
"""

import graphene
from django.core.exceptions import ObjectDoesNotExist
from graphql import FieldNode, FragmentSpreadNode, InlineFragmentNode
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied

from apps.trips.models import Trip


def choices_enum(choices, name, description):
    """Enum GraphQL tiré d'un TextChoices.

    Les valeurs sont en majuscules et le libellé français sert de description.
    """
    return graphene.Enum.from_enum(
        choices,
        name=name,
        description=lambda member: description if member is None else member.label,
    )


def authenticated_user(info):
    """Renvoie l'utilisateur authentifié par le jeton JWT, ou lève NotAuthenticated."""
    user = info.context.user
    if not user.is_authenticated:
        raise NotAuthenticated()
    return user


def visible_trips(info):
    """Les voyages dont l'utilisateur est membre. Tous les resolvers partent de là."""
    return Trip.objects.visible_to(authenticated_user(info))


def get_or_not_found(queryset, message, **lookup):
    """Renvoie l'objet s'il est dans le queryset, sinon NotFound (comme le 404 REST)."""
    try:
        return queryset.get(**lookup)
    except (ObjectDoesNotExist, ValueError, TypeError) as exc:  # ValueError : id pas numérique
        raise NotFound(message) from exc


def check_object_permission(info, permission_class, obj):
    """Vérifie une permission objet de apps.core.permissions (sinon PermissionDenied)."""
    permission = permission_class()
    if not permission.has_object_permission(info.context, None, obj):
        raise PermissionDenied(permission.message)


def serializer_context(info):
    """Contexte attendu par les serializers DRF (la requête contient l'utilisateur)."""
    return {"request": info.context}


def save_serializer(serializer, **kwargs):
    """Valide puis enregistre. Une erreur donne une erreur GraphQL validation_error."""
    serializer.is_valid(raise_exception=True)
    return serializer.save(**kwargs)


def selected_fields(info):
    """Noms des champs demandés juste sous le champ courant (fragments compris).

    On s'en sert pour ne précharger (prefetch_related) que les relations demandées.
    """
    names = set()

    def visit(selection_set):
        for selection in selection_set.selections:
            if isinstance(selection, FieldNode):
                names.add(selection.name.value)
            elif isinstance(selection, InlineFragmentNode):
                visit(selection.selection_set)
            elif isinstance(selection, FragmentSpreadNode):
                visit(info.fragments[selection.name.value].selection_set)

    for node in info.field_nodes:
        if node.selection_set:
            visit(node.selection_set)
    return names
