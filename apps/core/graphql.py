"""Outils communs aux schémas GraphQL des applications.

Les resolvers lèvent les mêmes exceptions que l'API REST (NotAuthenticated, NotFound,
PermissionDenied, ValidationError de DRF, ValidationError de Django, erreurs des
services externes) : TravelHubGraphQLView les traduit en erreurs GraphQL dont
extensions porte le code et les détails de l'erreur REST équivalente.
"""

import graphene
from django.core.exceptions import ObjectDoesNotExist
from graphql import FieldNode, FragmentSpreadNode, InlineFragmentNode
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied

from apps.trips.models import Trip


def choices_enum(choices, name, description):
    """Enum GraphQL d'un TextChoices : valeurs en majuscules, libellé français en description."""
    return graphene.Enum.from_enum(
        choices,
        name=name,
        description=lambda member: description if member is None else member.label,
    )


def authenticated_user(info):
    """Utilisateur authentifié par le jeton JWT de la requête, sinon NotAuthenticated."""
    user = info.context.user
    if not user.is_authenticated:
        raise NotAuthenticated()
    return user


def visible_trips(info):
    """Point de départ de tout resolver : les voyages dont l'utilisateur est membre."""
    return Trip.objects.visible_to(authenticated_user(info))


def get_or_not_found(queryset, message, **lookup):
    """Objet du queryset ; NotFound s'il n'y est pas, comme le 404 de l'API REST."""
    try:
        return queryset.get(**lookup)
    except (ObjectDoesNotExist, ValueError, TypeError) as exc:  # ValueError : id non numérique
        raise NotFound(message) from exc


def check_object_permission(info, permission_class, obj):
    """Applique une permission objet de apps.core.permissions ; PermissionDenied sinon."""
    permission = permission_class()
    if not permission.has_object_permission(info.context, None, obj):
        raise PermissionDenied(permission.message)


def serializer_context(info):
    """Contexte attendu par les serializers DRF : la requête porte l'utilisateur."""
    return {"request": info.context}


def save_serializer(serializer, **kwargs):
    """Valide puis enregistre ; les erreurs deviennent une erreur GraphQL validation_error."""
    serializer.is_valid(raise_exception=True)
    return serializer.save(**kwargs)


def selected_fields(info):
    """Noms des champs demandés directement sous le champ en cours, fragments compris.

    Sert à ne précharger (prefetch_related) que les relations demandées.
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
